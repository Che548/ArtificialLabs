export function toggleJournalOption(
  selectedOptions: readonly string[],
  option: string,
  exclusiveOption?: string,
): string[] {
  if (selectedOptions.includes(option)) {
    return selectedOptions.filter((value) => value !== option);
  }

  if (option === exclusiveOption) {
    return [option];
  }

  return [
    ...selectedOptions.filter((value) => value !== exclusiveOption),
    option,
  ];
}
