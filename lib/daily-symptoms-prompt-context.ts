import { createContext, useContext } from 'react';

export const DailySymptomsPromptContext = createContext<() => void>(() => {});

export function useDailySymptomsPrompt() {
  return useContext(DailySymptomsPromptContext);
}
