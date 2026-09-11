/** Verify the actual current-host directory artifact, without guessing builder's NoOpTarget metadata. */
import { join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { verifyElectronExecutableFuses } from './verify-electron-fuses.ts'
export default async function verify(result) {
  if (process.platform !== 'darwin') throw new Error('This local product packaging lane is macOS-only; validate Windows separately')
  const executable=resolve(result.outDir,`mac-${process.arch}`,'LawyerCopilot.app','Contents','MacOS','LawyerCopilot')
  if(!existsSync(executable))throw new Error('Expected LawyerCopilot directory artifact does not exist: '+executable)
  await verifyElectronExecutableFuses(executable)
  console.log('LawyerCopilot final executable fuses verified: RunAsNode, embedded ASAR integrity, OnlyLoadAppFromAsar')
  return []
}
