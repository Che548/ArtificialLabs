// Keep a single shared iOS/Android scenario. Android resumes its manifest
// Activity through ADB between two short Maestro sessions; no assertions are
// removed and an unexpected launch sequence is a hard error.
export function splitAndroidResumeFlow(source, maestroDirectory) {
  const launch = '- launchApp:\n    stopApp: false\n    permissions:\n      all: unset\n';
  const parts = source.split(launch);
  if (parts.length !== 2 || !parts[0].endsWith('- pressKey: home\n')) {
    throw new Error('Expected exactly one non-destructive Home/resume sequence');
  }
  const headerEnd = source.indexOf('\n---\n');
  if (headerEnd < 0) throw new Error('Missing native scenario header');
  const header = source.slice(0, headerEnd + 5);
  const resolveFlows = text => text.replace(/^(\s*(?:- runFlow:|file:) )([\w-]+\.yml)$/gm,
    (_match, prefix, name) => `${prefix}${JSON.stringify(`${maestroDirectory}/${name}`)}`);
  return { before: resolveFlows(parts[0]), after: resolveFlows(header + parts[1]) };
}
