export function mayUseMedicalCloud(input: {
  authenticated: boolean;
  consentedOnDevice: boolean;
  accountPendingDeletion: boolean;
}) {
  return (
    input.authenticated &&
    input.consentedOnDevice &&
    !input.accountPendingDeletion
  );
}
