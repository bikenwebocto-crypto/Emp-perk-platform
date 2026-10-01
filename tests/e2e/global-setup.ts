// Reuses the root e2e/ suite's environment probe (server-up + credential
// check) so tests/e2e specs skip gracefully instead of duplicating it.
export { default } from '../../e2e/global-setup'
