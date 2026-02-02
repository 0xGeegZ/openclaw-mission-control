#!/bin/bash
# Optional build-time hook for extra toolchains (Rust, Go, Python, etc.).
# Runs as root during docker build. Edit and rebuild to add packages.
# Examples:
#   apt-get update && apt-get install -y python3 python3-pip
#   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
echo "No custom setup configured."
