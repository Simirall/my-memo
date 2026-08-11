export const scheduleBackgroundTask = (
  getExecutionContext: () => {
    waitUntil(promise: Promise<unknown>): void;
  },
  createTask: () => Promise<unknown>,
) => {
  let executionContext: { waitUntil(promise: Promise<unknown>): void };
  try {
    executionContext = getExecutionContext();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "This context has no ExecutionContext"
    ) {
      return false;
    }
    throw error;
  }
  executionContext.waitUntil(createTask());
  return true;
};
