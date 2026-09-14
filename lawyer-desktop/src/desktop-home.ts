import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const CURRENT_HOME_NAME = '.lawyerdesk-managed-desktop'
const LEGACY_HOME_NAME = '.lawyercopilot-managed-desktop'

/**
 * Resolve the managed desktop data home without abandoning an existing install.
 * Explicit test/operator homes keep their historical precedence; fresh installs
 * use the LawyerDesk name, while a legacy home is selected only when it already
 * contains managed state.
 */
export function resolveLawyerDesktopHome(
  homeDirectory: string = homedir(),
  explicitHome: string | undefined = process.env.LAWYER_DESKTOP_HOME,
): string {
  if (explicitHome !== undefined) return explicitHome

  const current = join(homeDirectory, CURRENT_HOME_NAME)
  const legacy = join(homeDirectory, LEGACY_HOME_NAME)
  const hasManagedState = (directory: string): boolean => (
    existsSync(join(directory, 'product.json')) || existsSync(join(directory, 'profiles'))
  )

  if (hasManagedState(current) || !hasManagedState(legacy)) return current
  return legacy
}
