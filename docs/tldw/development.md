# Documentation and release

Maintain documentation in `docs/tldw/`. The root `readme.md` is generated; do not edit it directly. Run `bun run readme` to regenerate it.

`bun run build` regenerates the README and compiles ESM JavaScript with TypeScript declarations into `dist`. `prepack` invokes the same build automatically for npm packages. The tagged release workflow validates types, tests, lint and build before publishing.

For reproducible development installs, use `bun install --frozen-lockfile`.
