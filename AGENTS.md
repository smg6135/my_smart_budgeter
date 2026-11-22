# Session memory

Read [docs/HANDOFF.md](docs/HANDOFF.md) before starting work. It records the current architecture, user preferences, release state, verification limits, and remaining work. Older deployment/refinement documents contain historical behavior that the current app has replaced.

Conserve the user's native-build quota. Prefer local checks and matching compiled artifacts. Native CI is manual; do not start EAS/native builds speculatively or to verify documentation changes.

For mobile work, also follow [apps/mobile/AGENTS.md](apps/mobile/AGENTS.md), especially its Expo-version documentation and generated-project rules. Keep the handoff current after substantive changes, and distinguish implemented, verified, and pending work.
