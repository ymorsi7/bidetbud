#!/bin/bash
set -euo pipefail
echo "=== BidetBud pre-xcodebuild (project-local) ==="
ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
cd "$ROOT"
test -d mobile/ios/App/CapPackages/app
grep -q 'CapPackages/app' mobile/ios/App/CapApp-SPM/Package.swift
echo "pre-xcodebuild OK"
