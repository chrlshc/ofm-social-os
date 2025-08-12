import { Issuer, generators } from "openid-client";
import { env } from "./env";

export async function buildOIDC() {
  const issuer = await Issuer.discover(env.OIDC_ISSUER_URL);
  const client = new issuer.Client({
    client_id: env.OIDC_CLIENT_ID,
    client_secret: env.OIDC_CLIENT_SECRET,
    redirect_uris: [env.OIDC_REDIRECT_URI],
    response_types: ["code"],
  });
  return { client, generators };
}