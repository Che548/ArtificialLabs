import { transformSync } from '@babel/core';

// Inspector evaluation bypasses Metro. Lower async functions just as Metro
// does, keeping helpers inline and ignoring the application's Babel config.
export function hermesQaExpression(task, argument) {
  return transformSync(`void (${task.toString()})(${JSON.stringify(argument)}); true`, {
    babelrc: false,
    configFile: false,
    plugins: ['@babel/plugin-transform-async-to-generator'],
  }).code;
}
