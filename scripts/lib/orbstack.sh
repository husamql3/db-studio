#!/usr/bin/env bash
# Sourced by the init-db scripts. Points the docker CLI at OrbStack's engine
# (https://docs.orbstack.dev/) for this script only; the user's global docker
# context is left alone. OrbStack is macOS-only, so other platforms keep using
# whatever docker engine is installed.

if [ "$(uname -s)" = "Darwin" ]; then
  if ! command -v orb >/dev/null 2>&1; then
    echo "[init-db] OrbStack is not installed or not in PATH"
    echo "[init-db] install it with: brew install orbstack (https://docs.orbstack.dev/install)"
    exit 1
  fi

  export DOCKER_CONTEXT=orbstack

  if ! docker info >/dev/null 2>&1; then
    echo "[init-db] starting OrbStack..."
    orb start
  fi
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[init-db] docker is not installed or not in PATH"
  exit 1
fi
