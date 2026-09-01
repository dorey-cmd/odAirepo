import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/db/queries/admin";
import { getContract, listContractFiles } from "@/lib/db/queries/contracts";
import ContractChat from "./ContractChat";
import ContractStatusBadge from "@/components/ContractStatusBadge";
import ContractActionsMenu from "@/components/ContractActionsMenu";

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ contractId: string }>;
}) {
  const { contractId } = await params;
  const supabase = await createClient();

  // Normal RLS scopes contracts to the caller's own org(s). A platform admin
  // viewing a contract from a different org (e.g. from /admin/contracts)
  // would otherwise 404 here even though they're allowed to see it read-only
  // - fall back to the service-role client once confirmed as admin, rather
  // than widening the contracts RLS policy itself.
  let readClient = supabase;
  let contract = await getContract(readClient, contractId);
  if (!contract && (await isPlatformAdmin(supabase))) {
    readClient = createAdminClient();
    contract = await getContract(readClient, contractId);
  }
  if (!contract) notFound();

  const { data: chat } = await readClient
    .from("contract_chats")
    .select("id")
    .eq("contract_id", contractId)
    .maybeSingle();

  const { data: messages } = chat
    ? await readClient
        .from("contract_chat_messages")
        .select("*")
        .eq("chat_id", chat.id)
        .order("created_at", { ascending: true })
    : { data: [] };

  const files = await listContractFiles(readClient, contractId);

  return (
    <div className="stack">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>{contract.title}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <ContractStatusBadge contractId={contractId} initialStatus={contract.status} />
          <ContractActionsMenu contractId={contractId} isArchived={contract.status === "archived"} redirectTo="/contracts" />
        </div>
      </div>
      <p style={{ color: "var(--text-muted)", marginTop: -12 }}>{contract.contract_environments?.name}</p>

      <ContractChat contractId={contractId} initialMessages={messages ?? []} initialStatus={contract.status} />

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>קבצי החוזה</h2>
        {files.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>עדיין אין טיוטות.</p>
        ) : (
          <ul style={{ margin: 0, paddingInlineStart: "1.2rem" }}>
            {files.map((f) => (
              <li key={f.id}>
                <a href={`/api/contracts/${contractId}/files/${f.id}`}>
                  {f.original_filename} {f.version ? `(גרסה ${f.version})` : ""}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
