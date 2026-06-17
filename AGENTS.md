# Environment Setup

Always run `nvm use` before executing any commands in this project. This ensures the correct Node.js version is active.

This project uses **pnpm** as its package manager. Always use `pnpm` instead of `npm` or `yarn` for all package operations:

- Install deps: `pnpm install`
- Add a package: `pnpm add <pkg>`
- Run scripts: `pnpm <script>` (e.g. `pnpm dev`, `pnpm build`)
- Never run `npm install`, `npm ci`, or `yarn`

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->
