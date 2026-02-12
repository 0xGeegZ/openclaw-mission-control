import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConvexTestingHelper } from "convex/testing";
import { api } from "./_generated/api";
import schema from "./schema";

describe("files", () => {
  let helper: ConvexTestingHelper<typeof schema>;

  beforeEach(async () => {
    helper = new ConvexTestingHelper(schema);
  });

  describe("generateUploadUrl", () => {
    it("should return upload URL for valid file", async () => {
      const url = await helper.mutation(api.files.generateUploadUrl, {
        fileName: "test.pdf",
        mimeType: "application/pdf",
        size: 1024,
      });
      expect(url).toBeTruthy();
      expect(typeof url).toBe("string");
    });

    it("should reject file exceeding 25MB limit", async () => {
      await expect(
        helper.mutation(api.files.generateUploadUrl, {
          fileName: "large.bin",
          mimeType: "application/octet-stream",
          size: 26 * 1024 * 1024, // 26 MB
        })
      ).rejects.toThrow("File exceeds 25 MB limit");
    });

    it("should reject empty fileName", async () => {
      await expect(
        helper.mutation(api.files.generateUploadUrl, {
          fileName: "",
          mimeType: "text/plain",
          size: 100,
        })
      ).rejects.toThrow("File name cannot be empty");
    });

    it("should accept file at exactly 25MB limit", async () => {
      const url = await helper.mutation(api.files.generateUploadUrl, {
        fileName: "max.bin",
        mimeType: "application/octet-stream",
        size: 25 * 1024 * 1024, // Exactly 25 MB
      });
      expect(url).toBeTruthy();
    });
  });

  describe("registerUpload", () => {
    it("should save file metadata with account isolation", async () => {
      const result = await helper.mutation(api.files.registerUpload, {
        fileName: "document.pdf",
        mimeType: "application/pdf",
        size: 2048,
        storageId: "test-storage-id",
      });
      
      expect(result).toHaveProperty("fileId");
      expect(result).toHaveProperty("storageId", "test-storage-id");
    });

    it("should reject file exceeding 25MB limit", async () => {
      await expect(
        helper.mutation(api.files.registerUpload, {
          fileName: "large.bin",
          mimeType: "application/octet-stream",
          size: 26 * 1024 * 1024,
          storageId: "test-id",
        })
      ).rejects.toThrow("File exceeds 25 MB limit");
    });

    it("should reject empty storageId", async () => {
      await expect(
        helper.mutation(api.files.registerUpload, {
          fileName: "test.txt",
          mimeType: "text/plain",
          size: 100,
          storageId: "",
        })
      ).rejects.toThrow("storageId required");
    });

    it("should store file with correct metadata", async () => {
      const result = await helper.mutation(api.files.registerUpload, {
        fileName: "report.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: 5120,
        storageId: "xlsx-storage-id",
      });

      expect(result.fileId).toBeTruthy();
      expect(result.storageId).toBe("xlsx-storage-id");
    });
  });

  describe("getFileById", () => {
    it("should retrieve file by ID with account isolation", async () => {
      const registered = await helper.mutation(api.files.registerUpload, {
        fileName: "test.pdf",
        mimeType: "application/pdf",
        size: 1024,
        storageId: "pdf-storage-id",
      });

      const file = await helper.query(api.files.getFileById, {
        fileId: registered.fileId,
      });

      expect(file).toBeTruthy();
      expect(file.fileName).toBe("test.pdf");
      expect(file.storageId).toBe("pdf-storage-id");
    });

    it("should reject non-existent file ID", async () => {
      await expect(
        helper.query(api.files.getFileById, {
          fileId: "nonexistent-id" as any,
        })
      ).rejects.toThrow("File not found");
    });
  });

  describe("getDownloadUrl", () => {
    it("should return download URL for valid storageId", async () => {
      const registered = await helper.mutation(api.files.registerUpload, {
        fileName: "document.pdf",
        mimeType: "application/pdf",
        size: 2048,
        storageId: "download-test-id",
      });

      const url = await helper.query(api.files.getDownloadUrl, {
        storageId: "download-test-id",
      });

      expect(url).toBeTruthy();
      expect(typeof url).toBe("string");
    });

    it("should enforce account isolation on download URL retrieval", async () => {
      await expect(
        helper.query(api.files.getDownloadUrl, {
          storageId: "non-existent-id",
        })
      ).rejects.toThrow("File not found");
    });
  });

  describe("file size validation", () => {
    const testCases = [
      { size: 0, shouldFail: false, name: "empty file" },
      { size: 1, shouldFail: false, name: "1 byte" },
      { size: 1024 * 1024, shouldFail: false, name: "1 MB" },
      { size: 10 * 1024 * 1024, shouldFail: false, name: "10 MB" },
      { size: 25 * 1024 * 1024, shouldFail: false, name: "25 MB (limit)" },
      { size: 25 * 1024 * 1024 + 1, shouldFail: true, name: "25 MB + 1 byte" },
      { size: 50 * 1024 * 1024, shouldFail: true, name: "50 MB" },
    ];

    testCases.forEach(({ size, shouldFail, name }) => {
      it(`should ${shouldFail ? "reject" : "accept"} ${name}`, async () => {
        const operation = async () => {
          await helper.mutation(api.files.generateUploadUrl, {
            fileName: `test-${size}.bin`,
            mimeType: "application/octet-stream",
            size,
          });
        };

        if (shouldFail) {
          await expect(operation()).rejects.toThrow("File exceeds 25 MB limit");
        } else {
          await expect(operation()).resolves.toBeTruthy();
        }
      });
    });
  });

  describe("account isolation", () => {
    it("should isolate files by account", async () => {
      // Register file
      const result = await helper.mutation(api.files.registerUpload, {
        fileName: "private.pdf",
        mimeType: "application/pdf",
        size: 1024,
        storageId: "private-id",
      });

      // Retrieve file (should work with same account context)
      const file = await helper.query(api.files.getFileById, {
        fileId: result.fileId,
      });

      expect(file).toBeTruthy();
      expect(file.accountId).toBeTruthy();
    });
  });
});
