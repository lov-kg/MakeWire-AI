import type { GeneratedCode } from '../../types'
import { generateArduinoCode } from './arduino'
import { generateEspIdfCode } from './espidf'
import { generateMicroPythonCode } from './micropython'
import { generatePythonCode } from './python'
import { generateStructuredTextCode } from './structured-text'
import {
  makeTitle,
  resolveFramework,
  type CodeDraft,
  type LocalCodeInput,
} from './shared'
import { uid } from '../utils'

export type { LocalCodeInput }
export { frameworkLabel, resolveFramework } from './shared'

/**
 * Deterministic, offline code generation. The cloud endpoint can enhance or
 * rewrite this output, but the local engine remains the source of truth for the
 * board and pin map.
 */
export function generateLocalCode(input: LocalCodeInput): GeneratedCode {
  const framework = resolveFramework(input.framework, input.board)
  let draft: CodeDraft
  if (framework === 'micropython') {
    draft = generateMicroPythonCode(input)
  } else if (framework === 'python') {
    draft = generatePythonCode(input)
  } else if (framework === 'structured-text') {
    draft = generateStructuredTextCode(input)
  } else if (framework === 'esp-idf') {
    draft = generateEspIdfCode(input)
  } else {
    draft = generateArduinoCode(input)
  }

  return {
    id: uid('code'),
    title: makeTitle(input.prompt, input.projectComponents[0]?.componentId ?? 'MakerWire'),
    prompt: input.prompt,
    framework,
    source: 'local',
    code: draft.code,
    filename: draft.filename,
    explanation: draft.explanation,
    libraries: draft.libraries,
    createdAt: new Date().toISOString(),
  }
}
