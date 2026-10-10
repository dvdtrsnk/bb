import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { retryAvailabilitySchema } from "./retry-contract.js";

export const dispatchAvailabilityMethod = "provider-dispatch.v1.availability";
export const dispatchAvailabilityContract = defineRpcContract({
  [dispatchAvailabilityMethod]: {
    input: z.object({
      providerId: z.string().min(1),
      model: z.string().min(1),
    }),
    output: retryAvailabilitySchema,
    experimental_description:
      "Availability for a new turn without creating a thread or selecting an account. Ready means the active pool route has a usable account for the model; blocked gives its earliest known recovery. Not-routed means new turns use provider-local credentials. Accounts are shared across hosts. Exhausted OAuth observations are refreshed with the pool's existing rate limit.",
  },
});
