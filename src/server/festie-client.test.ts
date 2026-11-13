import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FestieError, exchangeCode, fetchConnection, revokeRemote } from "./festie-client";

let server: Server;
let apiUrl = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.url === "/apps/oauth/token") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const b = JSON.parse(raw);
        if (b.code === "good") {
          return send(200, { access_token: "fat_1", festival_id: "f1", sub_fest_ids: ["s1"], external_ref: "g1" });
        }
        if (b.code === "weird") return send(200, { nope: true });
        if (b.code === "down") return send(503, {});
        return send(400, { error: "invalid_grant" });
      });
      return;
    }
    if (req.url === "/app-api/v1/connection") {
      const token = (req.headers.authorization ?? "").replace("Bearer ", "");
      if (token === "live") {
        return send(200, { festival: { id: "f1", name: "Fest" }, subFests: [{ id: "s1", name: "Main", timeZone: "UTC" }] });
      }
      if (token === "revoked") return send(401, {});
      if (token === "empty") return send(200, { festival: null, subFests: [] });
      return send(500, {});
    }
    send(404, {});
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const app = () => ({ apiUrl, clientId: "c", clientSecret: "s" });

describe("exchangeCode", () => {
  it("returns the token and festival", async () => {
    expect(await exchangeCode(app(), "good", "http://x/cb")).toEqual({
      accessToken: "fat_1",
      festivalId: "f1",
      subFestIds: ["s1"],
      externalRef: "g1",
    });
  });

  it("maps a rejected code, a server error and a strange answer", async () => {
    await expect(exchangeCode(app(), "bad", "u")).rejects.toMatchObject({ kind: "invalid_grant" });
    await expect(exchangeCode(app(), "down", "u")).rejects.toMatchObject({ kind: "unavailable" });
    await expect(exchangeCode(app(), "weird", "u")).rejects.toMatchObject({ kind: "bad_response" });
  });

  it("reports an unreachable festie as unavailable", async () => {
    await expect(exchangeCode({ ...app(), apiUrl: "http://127.0.0.1:1" }, "good", "u")).rejects.toBeInstanceOf(FestieError);
  });
});

describe("fetchConnection", () => {
  it("returns festival and fests", async () => {
    const result = await fetchConnection(app(), "live");
    expect(result.festival?.name).toBe("Fest");
    expect(result.subFests).toHaveLength(1);
  });

  it("treats 401 as revoked and other failures as unavailable", async () => {
    await expect(fetchConnection(app(), "revoked")).rejects.toMatchObject({ kind: "revoked" });
    await expect(fetchConnection(app(), "boom")).rejects.toMatchObject({ kind: "unavailable" });
    await expect(fetchConnection(app(), "empty")).rejects.toMatchObject({ kind: "bad_response" });
  });
});

describe("revokeRemote", () => {
  it("never throws", async () => {
    expect(await revokeRemote({ apiUrl: "http://127.0.0.1:1" }, "t")).toBe(false);
  });
});
