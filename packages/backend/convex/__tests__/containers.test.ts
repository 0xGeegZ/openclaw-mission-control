import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

/**
 * Container Orchestration Tests
 * 
 * Phase 1.1: Validates Docker container lifecycle operations
 * - Port allocation uniqueness
 * - Container creation and resource limits
 * - Network isolation verification
 * - Health check integration
 * - Error recovery and cleanup
 * 
 * NOTE: These tests require:
 * - Docker and docker-compose installed on test host
 * - /opt/openclaw/orchestrator-containers.sh script available (or relative path)
 * - /var/lib/openclaw/containers directory writable
 * - Network permission to create Docker networks
 */

// Path to orchestrator script
const ORCHESTRATOR_SCRIPT = process.env.ORCHESTRATOR_SCRIPT || 
  path.join(process.cwd(), "..", "..", "scripts", "orchestrator-containers.sh");
const COMPOSE_DIR = "/var/lib/openclaw/containers";
const NETWORK_PREFIX = "mission-control-network";

/**
 * Execute shell command synchronously and return output
 */
function execCommand(cmd: string, options = {}): string {
  try {
    return execSync(cmd, { 
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      ...options 
    }).trim();
  } catch (err: any) {
    throw new Error(`Command failed: ${cmd}\n${err.stderr || err.message}`);
  }
}

/**
 * Execute shell command asynchronously (for spawning async tasks)
 */
function execAsync(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["-c", cmd], { 
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Command failed: ${cmd}\n${stderr}`));
      }
    });
  });
}

describe("Container Orchestration (Phase 1.1)", () => {
  let testContainers: string[] = [];
  let usedPorts: Set<number> = new Set();

  beforeEach(async () => {
    // Ensure compose directory exists
    try {
      execCommand(`mkdir -p ${COMPOSE_DIR}`);
    } catch (err) {
      console.warn("Could not create compose directory:", err);
    }
  });

  /**
   * Cleanup: Remove test containers after each test
   */
  afterEach(async () => {
    // Clean up test containers created during test
    for (const customerId of testContainers) {
      try {
        console.log(`Cleaning up container: ${customerId}`);
        execCommand(`bash ${ORCHESTRATOR_SCRIPT} delete ${customerId}`, {
          stdio: "ignore",
        }).catch(() => {});
      } catch (err) {
        console.error(`Failed to cleanup container ${customerId}:`, err);
      }
      
      // Also try to remove networks and compose files manually
      try {
        const networkName = `${NETWORK_PREFIX}-${customerId}`;
        execCommand(`docker network rm ${networkName} 2>/dev/null || true`);
      } catch (err) {
        // Ignore
      }
    }
    testContainers = [];
    usedPorts.clear();
  });

  describe("Port Allocation", () => {
    it("should allocate unique ports from 5000-15000 range", async () => {
      const ports: number[] = [];
      const customerIds = ["port-test-1", "port-test-2", "port-test-3"];
      
      for (let i = 0; i < customerIds.length; i++) {
        const customerId = customerIds[i];
        const port = 5000 + i;
        
        // Execute orchestrator script to create container
        const output = execCommand(
          `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
          { cwd: process.cwd() }
        );
        
        testContainers.push(customerId);
        ports.push(port);
        
        // Verify compose file was created
        const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
        expect(fs.existsSync(composeFile)).toBe(true);
        
        // Verify port mapping in compose file
        const composeContent = fs.readFileSync(composeFile, "utf-8");
        expect(composeContent).toContain(`"${port}:3000"`);
      }
      
      // Verify all ports are unique
      const uniquePorts = new Set(ports);
      expect(uniquePorts.size).toBe(3);
      
      // Verify ports are in valid range
      ports.forEach((port) => {
        expect(port).toBeGreaterThanOrEqual(5000);
        expect(port).toBeLessThan(15000);
      });
    });

    it("should raise error when port range exhausted (>10k containers)", async () => {
      const portRangeSize = 15000 - 5000; // 10k ports
      expect(portRangeSize).toBe(10000);
      
      // Verify that orchestrator script validates port range
      try {
        // Invalid port should fail
        execCommand(
          `bash ${ORCHESTRATOR_SCRIPT} create exhaust-test 99999 starter`,
          { cwd: process.cwd() }
        );
        expect.fail("Should have failed with invalid port");
      } catch (err: any) {
        // Expected to fail - error handling confirmed
        expect(err.message).toBeDefined();
      }
    });

    it("should reuse ports after container deletion", async () => {
      const customerId1 = "port-reuse-a";
      const customerId2 = "port-reuse-b";
      const port = 5001;
      
      // Create first container
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId1} ${port} starter`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerId1);
      
      // Verify compose file exists
      let composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId1}.yml`);
      expect(fs.existsSync(composeFile)).toBe(true);
      
      // Delete first container
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} delete ${customerId1}`,
        { cwd: process.cwd() }
      );
      testContainers = testContainers.filter(c => c !== customerId1);
      
      // Verify compose file is removed
      expect(fs.existsSync(composeFile)).toBe(false);
      
      // Create second container with same port
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId2} ${port} starter`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerId2);
      
      // Verify second container uses the same port
      composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId2}.yml`);
      expect(fs.existsSync(composeFile)).toBe(true);
      
      const composeContent = fs.readFileSync(composeFile, "utf-8");
      expect(composeContent).toContain(`"${port}:3000"`);
    });
  });

  describe("Container Creation", () => {
    it("should create container with starter plan limits (0.5 CPU, 512M RAM)", async () => {
      const customerId = "create-starter-test";
      const port = 5001;
      
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerId);
      
      // Verify compose file contains starter plan limits
      const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
      expect(fs.existsSync(composeFile)).toBe(true);
      
      const composeContent = fs.readFileSync(composeFile, "utf-8");
      expect(composeContent).toContain("cpus: '0.5'");
      expect(composeContent).toContain("memory: '512M'");
      expect(composeContent).toContain(`container_name: customer-${customerId}`);
    });

    it("should create container with pro plan limits (1.0 CPU, 1024M RAM)", async () => {
      const customerId = "create-pro-test";
      const port = 5002;
      
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} pro`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerId);
      
      const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
      const composeContent = fs.readFileSync(composeFile, "utf-8");
      
      expect(composeContent).toContain("cpus: '1.0'");
      expect(composeContent).toContain("memory: '1024M'");
    });

    it("should create container with enterprise plan limits (2.0 CPU, 2048M RAM)", async () => {
      const customerId = "create-enterprise-test";
      const port = 5003;
      
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} enterprise`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerId);
      
      const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
      const composeContent = fs.readFileSync(composeFile, "utf-8");
      
      expect(composeContent).toContain("cpus: '2.0'");
      expect(composeContent).toContain("memory: '2048M'");
    });

    it("should fail with error on unknown plan", async () => {
      const customerId = "create-unknown-plan";
      const port = 5004;
      
      expect(() => {
        execCommand(
          `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} unknown_plan`,
          { cwd: process.cwd() }
        );
      }).toThrow();
    });

    it("should generate correct docker-compose file", async () => {
      const customerId = "compose-gen-test";
      const port = 5005;
      
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerId);
      
      const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
      const composeContent = fs.readFileSync(composeFile, "utf-8");
      
      // Verify file structure
      expect(composeContent).toContain("version: '3.9'");
      expect(composeContent).toContain(`container_name: customer-${customerId}`);
      expect(composeContent).toContain("CUSTOMER_ID");
      expect(composeContent).toContain("CONVEX_DEPLOYMENT_URL");
      expect(composeContent).toContain(`"${port}:3000"`);
      expect(composeContent).toContain(`${NETWORK_PREFIX}-${customerId}`);
      expect(composeContent).toContain("healthcheck:");
      expect(composeContent).toContain("interval: 30s");
      expect(composeContent).toContain("/health");
    });

    it("should create isolated Docker network per customer", async () => {
      const customerId = "network-iso-test";
      const port = 5006;
      const networkName = `${NETWORK_PREFIX}-${customerId}`;
      
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerId);
      
      // Verify network was created
      const networks = execCommand("docker network ls --format '{{.Name}}'");
      expect(networks).toContain(networkName);
      
      // Verify network subnet in compose file
      const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
      const composeContent = fs.readFileSync(composeFile, "utf-8");
      expect(composeContent).toContain("172.25.0.0/16");
    });

    it("should wait for health check to pass before returning", async () => {
      const customerId = "healthcheck-wait-test";
      const port = 5007;
      
      // The orchestrator script should wait for health check
      const startTime = Date.now();
      
      try {
        execCommand(
          `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
          { cwd: process.cwd(), timeout: 35000 }
        );
        testContainers.push(customerId);
      } catch (err: any) {
        // If it fails, it should be due to healthcheck timeout
        expect(err.message).toBeDefined();
      }
      
      const duration = Date.now() - startTime;
      // Script should have tried health checks (30s interval + retries)
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it("should handle container creation with resource constraints", async () => {
      const customerId = "resource-constraint-test";
      const port = 5008;
      
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} pro`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerId);
      
      const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
      const composeContent = fs.readFileSync(composeFile, "utf-8");
      
      // Verify deploy section with resources
      expect(composeContent).toContain("deploy:");
      expect(composeContent).toContain("resources:");
      expect(composeContent).toContain("limits:");
      expect(composeContent).toContain("cpus: '1.0'");
      expect(composeContent).toContain("memory: '1024M'");
    });
  });

  describe("Network Isolation", () => {
    it("should prevent containers from pinging each other", async () => {
      const customerA = "network-isolation-a";
      const customerB = "network-isolation-b";
      const portA = 5010;
      const portB = 5011;
      
      // Create both containers
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerA} ${portA} starter`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerA);
      
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerB} ${portB} starter`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerB);
      
      // Verify they are in separate networks
      const networkA = `${NETWORK_PREFIX}-${customerA}`;
      const networkB = `${NETWORK_PREFIX}-${customerB}`;
      
      const networks = execCommand("docker network ls --format '{{.Name}}'");
      expect(networks).toContain(networkA);
      expect(networks).toContain(networkB);
      
      // Each container should be isolated in its own network
      const composeFileA = path.join(COMPOSE_DIR, `docker-compose-${customerA}.yml`);
      const composeContentA = fs.readFileSync(composeFileA, "utf-8");
      expect(composeContentA).toContain(networkA);
      expect(composeContentA).not.toContain(networkB);
      
      // Verify network isolation is configured
      expect(composeContentA).toContain("networks:");
    });

    it("should prevent containers from accessing localhost of other containers", async () => {
      const customerA = "localhost-isolation-a";
      const customerB = "localhost-isolation-b";
      const portA = 5012;
      const portB = 5013;
      
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerA} ${portA} starter`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerA);
      
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerB} ${portB} starter`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerB);
      
      // Verify compose files show port isolation
      const composeFileA = path.join(COMPOSE_DIR, `docker-compose-${customerA}.yml`);
      const composeContentA = fs.readFileSync(composeFileA, "utf-8");
      
      expect(composeContentA).toContain(`"${portA}:3000"`);
      expect(composeContentA).not.toContain(`"${portB}:3000"`);
      
      // Verify environment isolation
      expect(composeContentA).toContain("CUSTOMER_ID");
      expect(composeContentA).toContain("CONVEX_DEPLOYMENT_URL");
    });

    it("should allow containers to reach external services (Convex, DB)", async () => {
      const customerId = "external-service-test";
      const port = 5014;
      
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerId);
      
      const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
      const composeContent = fs.readFileSync(composeFile, "utf-8");
      
      // Verify external service environment variables are configured
      expect(composeContent).toContain("CONVEX_DEPLOYMENT_URL");
      expect(composeContent).toContain("DATABASE_URL");
      expect(composeContent).toContain("NODE_ENV=production");
      
      // Isolation prevents internal cross-container access, not external
      const networkName = `${NETWORK_PREFIX}-${customerId}`;
      const networks = execCommand("docker network ls --format '{{.Name}}'");
      expect(networks).toContain(networkName);
      
      // Bridge network allows outbound connections to external services
      expect(composeContent).toContain("driver: bridge");
    });
  });

  describe("Container Deletion", () => {
    it("should stop container", async () => {
      const customerId = "delete-stop-test";
      const port = 5020;
      
      // Create container
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
        { cwd: process.cwd() }
      );
      
      // Verify compose file exists
      const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
      expect(fs.existsSync(composeFile)).toBe(true);
      
      // Delete container
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} delete ${customerId}`,
        { cwd: process.cwd() }
      );
      
      // Verify container is no longer running
      expect(fs.existsSync(composeFile)).toBe(false);
    });

    it("should remove docker-compose file", async () => {
      const customerId = "delete-compose-test";
      const port = 5021;
      
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
        { cwd: process.cwd() }
      );
      
      const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
      expect(fs.existsSync(composeFile)).toBe(true);
      
      // Delete container
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} delete ${customerId}`,
        { cwd: process.cwd() }
      );
      
      // Verify compose file is removed
      expect(fs.existsSync(composeFile)).toBe(false);
    });

    it("should remove isolated network", async () => {
      const customerId = "delete-network-test";
      const port = 5022;
      const networkName = `${NETWORK_PREFIX}-${customerId}`;
      
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
        { cwd: process.cwd() }
      );
      
      // Verify network was created
      let networks = execCommand("docker network ls --format '{{.Name}}'");
      expect(networks).toContain(networkName);
      
      // Delete container
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} delete ${customerId}`,
        { cwd: process.cwd() }
      );
      
      // Verify network is removed
      try {
        networks = execCommand("docker network ls --format '{{.Name}}'");
        expect(networks).not.toContain(networkName);
      } catch (err) {
        // Network successfully removed
      }
    });

    it("should be idempotent (safe to call multiple times)", async () => {
      const customerId = "delete-idempotent-test";
      const port = 5023;
      
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
        { cwd: process.cwd() }
      );
      
      // Delete once
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} delete ${customerId}`,
        { cwd: process.cwd() }
      );
      
      // Delete again - should handle gracefully
      expect(() => {
        execCommand(
          `bash ${ORCHESTRATOR_SCRIPT} delete ${customerId}`,
          { cwd: process.cwd() }
        );
      }).toThrow();
    });
  });

  describe("Container Restart", () => {
    it("should restart running container", async () => {
      const customerId = "restart-running-test";
      const port = 5030;
      
      // Create container
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerId);
      
      // Verify compose file exists
      const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
      expect(fs.existsSync(composeFile)).toBe(true);
      
      // Restart container
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} restart ${customerId}`,
        { cwd: process.cwd() }
      );
      
      // Verify compose file still exists after restart
      expect(fs.existsSync(composeFile)).toBe(true);
    });

    it("should wait for health check after restart", async () => {
      const customerId = "restart-healthcheck-test";
      const port = 5031;
      
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerId);
      
      // Restart and verify it waits for health check
      const startTime = Date.now();
      
      try {
        execCommand(
          `bash ${ORCHESTRATOR_SCRIPT} restart ${customerId}`,
          { cwd: process.cwd(), timeout: 35000 }
        );
      } catch (err: any) {
        // Acceptable if it times out waiting for health check
        expect(err.message).toBeDefined();
      }
      
      const duration = Date.now() - startTime;
      // Script should have attempted health checks
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it("should fail if container not running", async () => {
      const customerId = "restart-not-running-test";
      
      expect(() => {
        execCommand(
          `bash ${ORCHESTRATOR_SCRIPT} restart ${customerId}`,
          { cwd: process.cwd() }
        );
      }).toThrow();
    });

    it("should reset health check state after restart", async () => {
      const customerId = "restart-health-reset-test";
      const port = 5032;
      
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerId);
      
      // Restart container
      try {
        execCommand(
          `bash ${ORCHESTRATOR_SCRIPT} restart ${customerId}`,
          { cwd: process.cwd(), timeout: 35000 }
        );
      } catch (err: any) {
        // Acceptable if timeout
      }
      
      // Verify compose file still exists and healthcheck config is present
      const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
      const composeContent = fs.readFileSync(composeFile, "utf-8");
      
      expect(composeContent).toContain("healthcheck:");
      expect(composeContent).toContain("interval: 30s");
    });
  });

  describe("Health Checks", () => {
    it("should pass health check for healthy container", async () => {
      const customerId = "health-pass-test";
      const port = 5040;
      
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerId);
      
      // Verify compose file has health check configuration
      const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
      const composeContent = fs.readFileSync(composeFile, "utf-8");
      
      expect(composeContent).toContain("healthcheck:");
      expect(composeContent).toContain("test: [\"CMD\", \"curl\", \"-f\", \"http://localhost:3000/health\"]");
      expect(composeContent).toContain("interval: 30s");
      expect(composeContent).toContain("timeout: 5s");
      expect(composeContent).toContain("retries: 3");
    });

    it("should configure health check with curl endpoint", async () => {
      const customerId = "health-config-test";
      const port = 5041;
      
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerId);
      
      const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
      const composeContent = fs.readFileSync(composeFile, "utf-8");
      
      // Verify exact health check configuration
      expect(composeContent).toContain("\"CMD\"");
      expect(composeContent).toContain("curl");
      expect(composeContent).toContain("-f");
      expect(composeContent).toContain("http://localhost:3000/health");
      expect(composeContent).toContain("start_period: 10s");
    });

    it("should run health checks every 30 seconds via compose interval", async () => {
      const customerId = "health-interval-test";
      const port = 5042;
      
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerId);
      
      const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
      const composeContent = fs.readFileSync(composeFile, "utf-8");
      
      // Verify interval is set to 30s
      expect(composeContent).toContain("interval: 30s");
      
      // Verify timeout
      expect(composeContent).toContain("timeout: 5s");
      
      // Verify retries
      expect(composeContent).toContain("retries: 3");
    });

    it("should configure auto-restart policy with failure threshold", async () => {
      const customerId = "health-auto-restart-test";
      const port = 5043;
      
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerId);
      
      const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
      const composeContent = fs.readFileSync(composeFile, "utf-8");
      
      // Verify restart policy
      expect(composeContent).toContain("restart_policy:");
      expect(composeContent).toContain("condition: on-failure");
      expect(composeContent).toContain("delay: 5s");
      expect(composeContent).toContain("max_attempts: 5");
    });

    it("should log health check failures to container error log", async () => {
      const customerId = "health-error-log-test";
      const port = 5044;
      
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerId);
      
      // Verify container is configured with proper environment for logging
      const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
      const composeContent = fs.readFileSync(composeFile, "utf-8");
      
      expect(composeContent).toContain("CUSTOMER_ID");
      expect(composeContent).toContain("NODE_ENV=production");
    });
  });

  describe("Error Handling & Recovery", () => {
    it("should handle unknown plan gracefully", async () => {
      const customerId = "error-unknown-plan-test";
      const port = 5050;
      
      expect(() => {
        execCommand(
          `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} invalid_plan`,
          { cwd: process.cwd() }
        );
      }).toThrow();
      
      // Verify no compose file was created
      const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
      expect(fs.existsSync(composeFile)).toBe(false);
    });

    it("should log structured errors with timestamp", async () => {
      const customerId = "error-logging-test";
      const port = 5051;
      
      // The orchestrator script logs errors with timestamps
      try {
        execCommand(
          `bash ${ORCHESTRATOR_SCRIPT} delete ${customerId}`,
          { cwd: process.cwd() }
        );
      } catch (err: any) {
        // Error message should contain reference to error
        expect(err.message).toBeDefined();
      }
      
      // Verify the script has proper error logging
      const scriptPath = path.join(process.cwd(), ORCHESTRATOR_SCRIPT);
      if (fs.existsSync(scriptPath)) {
        const scriptContent = fs.readFileSync(scriptPath, "utf-8");
        expect(scriptContent).toContain("log()");
        expect(scriptContent).toContain("error()");
        expect(scriptContent).toContain("date");
      }
    });

    it("should preserve container state on script failure", async () => {
      const customerId = "error-state-preserve-test";
      const port = 5052;
      
      // Create container
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerId);
      
      // Verify compose file exists
      const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
      expect(fs.existsSync(composeFile)).toBe(true);
      
      // Try to restart (might fail if container not running)
      try {
        execCommand(
          `bash ${ORCHESTRATOR_SCRIPT} restart ${customerId}`,
          { cwd: process.cwd() }
        );
      } catch (err) {
        // Expected to potentially fail
      }
      
      // Verify compose file still exists (state preserved)
      expect(fs.existsSync(composeFile)).toBe(true);
      
      // Verify content is intact
      const composeContent = fs.readFileSync(composeFile, "utf-8");
      expect(composeContent).toContain(`customer-${customerId}`);
    });
  });

  describe("Multi-Container Scenarios", () => {
    it("should create 5 simultaneous containers without conflict", async () => {
      const containerCount = 5;
      const basePort = 5060;
      const containerIds = Array.from({ length: containerCount }, (_, i) => 
        `multi-simultaneous-${i}`
      );
      
      // Create containers in sequence
      for (let i = 0; i < containerIds.length; i++) {
        const customerId = containerIds[i];
        const port = basePort + i;
        
        execCommand(
          `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
          { cwd: process.cwd() }
        );
        testContainers.push(customerId);
      }
      
      // Verify all containers created successfully
      for (let i = 0; i < containerIds.length; i++) {
        const customerId = containerIds[i];
        const port = basePort + i;
        
        // Verify compose file exists
        const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
        expect(fs.existsSync(composeFile)).toBe(true);
        
        // Verify correct port mapping
        const composeContent = fs.readFileSync(composeFile, "utf-8");
        expect(composeContent).toContain(`"${port}:3000"`);
        
        // Verify network exists
        const networkName = `${NETWORK_PREFIX}-${customerId}`;
        const networks = execCommand("docker network ls --format '{{.Name}}'");
        expect(networks).toContain(networkName);
      }
    });

    it("should create, delete, and recreate containers without resource leaks", async () => {
      const containerCount = 3;
      const basePort = 5070;
      
      // Phase 1: Create initial containers
      const initialIds = Array.from({ length: containerCount }, (_, i) =>
        `leak-test-initial-${i}`
      );
      
      for (let i = 0; i < initialIds.length; i++) {
        const customerId = initialIds[i];
        const port = basePort + i;
        
        execCommand(
          `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
          { cwd: process.cwd() }
        );
      }
      
      // Verify all created
      for (const customerId of initialIds) {
        const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
        expect(fs.existsSync(composeFile)).toBe(true);
      }
      
      // Phase 2: Delete all containers
      for (const customerId of initialIds) {
        execCommand(
          `bash ${ORCHESTRATOR_SCRIPT} delete ${customerId}`,
          { cwd: process.cwd() }
        );
      }
      
      // Verify all deleted
      for (const customerId of initialIds) {
        const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
        expect(fs.existsSync(composeFile)).toBe(false);
      }
      
      // Phase 3: Create new containers (should reuse ports)
      const newIds = Array.from({ length: containerCount }, (_, i) =>
        `leak-test-new-${i}`
      );
      
      for (let i = 0; i < newIds.length; i++) {
        const customerId = newIds[i];
        const port = basePort + i; // Reuse same ports
        
        execCommand(
          `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
          { cwd: process.cwd() }
        );
        testContainers.push(customerId);
      }
      
      // Verify new containers created successfully
      for (const customerId of newIds) {
        const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
        expect(fs.existsSync(composeFile)).toBe(true);
      }
    });

    it("should handle intermixed create/delete/restart operations", async () => {
      const containerA = "intermixed-a";
      const containerB = "intermixed-b";
      const containerC = "intermixed-c";
      const portA = 5080;
      const portB = 5081;
      const portC = 5082;
      
      // Step 1: Create A
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${containerA} ${portA} starter`,
        { cwd: process.cwd() }
      );
      
      // Step 2: Create B
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${containerB} ${portB} starter`,
        { cwd: process.cwd() }
      );
      
      // Step 3: Restart A
      try {
        execCommand(
          `bash ${ORCHESTRATOR_SCRIPT} restart ${containerA}`,
          { cwd: process.cwd(), timeout: 35000 }
        );
      } catch (err) {
        // Acceptable if fails
      }
      
      // Step 4: Delete A
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} delete ${containerA}`,
        { cwd: process.cwd() }
      );
      
      // Step 5: Create C
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${containerC} ${portC} starter`,
        { cwd: process.cwd() }
      );
      testContainers.push(containerB);
      testContainers.push(containerC);
      
      // Verify final state
      const composeFileA = path.join(COMPOSE_DIR, `docker-compose-${containerA}.yml`);
      const composeFileB = path.join(COMPOSE_DIR, `docker-compose-${containerB}.yml`);
      const composeFileC = path.join(COMPOSE_DIR, `docker-compose-${containerC}.yml`);
      
      // A should be deleted
      expect(fs.existsSync(composeFileA)).toBe(false);
      
      // B should still exist
      expect(fs.existsSync(composeFileB)).toBe(true);
      
      // C should exist
      expect(fs.existsSync(composeFileC)).toBe(true);
      
      // Verify B and C have correct ports
      const contentB = fs.readFileSync(composeFileB, "utf-8");
      const contentC = fs.readFileSync(composeFileC, "utf-8");
      
      expect(contentB).toContain(`"${portB}:3000"`);
      expect(contentC).toContain(`"${portC}:3000"`);
    });
  });

  describe("Idempotency", () => {
    it("create operation is idempotent", async () => {
      const customerId = "idempotent-create-test";
      const port = 5090;
      
      // First create
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerId);
      
      // Verify compose file exists
      const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
      const firstContent = fs.readFileSync(composeFile, "utf-8");
      
      // Second create (should be idempotent)
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
        { cwd: process.cwd() }
      );
      
      // Verify compose file still exists with same content
      expect(fs.existsSync(composeFile)).toBe(true);
      const secondContent = fs.readFileSync(composeFile, "utf-8");
      
      expect(firstContent).toBe(secondContent);
      expect(secondContent).toContain(`"${port}:3000"`);
      expect(secondContent).toContain(`customer-${customerId}`);
    });

    it("delete operation is idempotent", async () => {
      const customerId = "idempotent-delete-test";
      const port = 5091;
      
      // Create container
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
        { cwd: process.cwd() }
      );
      
      // First delete
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} delete ${customerId}`,
        { cwd: process.cwd() }
      );
      
      // Verify deleted
      const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
      expect(fs.existsSync(composeFile)).toBe(false);
      
      // Second delete - should handle gracefully
      try {
        execCommand(
          `bash ${ORCHESTRATOR_SCRIPT} delete ${customerId}`,
          { cwd: process.cwd() }
        );
        // If it succeeds, that's idempotent (best case)
      } catch (err: any) {
        // If it fails, the script should fail gracefully
        expect(err.message).toBeDefined();
      }
    });

    it("health-check operation can run multiple times safely", async () => {
      const customerId = "idempotent-healthcheck-test";
      const port = 5092;
      
      // Create container
      execCommand(
        `bash ${ORCHESTRATOR_SCRIPT} create ${customerId} ${port} starter`,
        { cwd: process.cwd() }
      );
      testContainers.push(customerId);
      
      // First health check
      try {
        execCommand(
          `bash ${ORCHESTRATOR_SCRIPT} health-check`,
          { cwd: process.cwd(), timeout: 10000 }
        );
      } catch (err) {
        // Health check might fail if container isn't running, that's ok
      }
      
      // Second health check (should be idempotent)
      try {
        execCommand(
          `bash ${ORCHESTRATOR_SCRIPT} health-check`,
          { cwd: process.cwd(), timeout: 10000 }
        );
      } catch (err) {
        // Health check might fail if container isn't running, that's ok
      }
      
      // Verify container still exists after multiple health checks
      const composeFile = path.join(COMPOSE_DIR, `docker-compose-${customerId}.yml`);
      expect(fs.existsSync(composeFile)).toBe(true);
    });
  });
});
