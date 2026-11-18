#!/bin/bash
set -euo pipefail
echo "=== BidetBud post-clone (project-local) ==="
ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
cd "$ROOT"
ls mobile/ios/App/CapPackages
grep CapPackages mobile/ios/App/CapApp-SPM/Package.swift
echo "OK"
