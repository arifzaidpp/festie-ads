import { getCurrentRates, listRateHistory, setRates } from "@/server/rates";
import { readJson, route } from "@/server/http";
import { ratesInput } from "@/lib/validation";

export const GET = route(async ({ accountId }) => {
  const account = await accountId();
  return { current: await getCurrentRates(account), history: await listRateHistory(account) };
});

export const PUT = route(async ({ req, ownerId, accountId }) => {
  const account = await accountId();
  await setRates(ownerId, account, await readJson(req, ratesInput));
  return { current: await getCurrentRates(account) };
});
