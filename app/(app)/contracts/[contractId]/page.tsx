import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContract, listContractFiles } from "@/lib/db/queries/contracts";
import ContractChat from "./ContractChat";

const STATUS_LABELS: Record<string, string> = {
  intake: "בקליטה",
  awaiting_info: "ממתין לפרטים",
  drafting: "בניסוח",
  draft_ready: "טיוטה מוכנה",
  revising: "בעדכון",
  finalized: "סופי",
  archived: "בארכיון",
  error: "שגיאה",
};

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ contractId: string }>;
}) {
  const { contractId } = await params;
  const supabase = await createClient();

  const contract = await getContract(supabase, contractId);
  if (!contract) notFound();

  const { data: chat } = await supabase
    .from("contract_chats")
    .select("id")
    .eq("contract_id", contractId)
    .maybeSingle();

  const { data: messages } = chat
    ? await supabase
        .from("contract_chat_messages")
        .select("*")
        .eq("chat_id", chat.id)
        .order("created_at", { ascending: true })
    : { data: [] };

  const files = await listContractFiles(supabase, contractId);

  return (
    <div className="stack">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>{contract.title}</h1>
        <span style={{ color: "var(--text-muted)" }}>{STATUS_LABELS[contract.status] ?? contract.status}</span>
      </div>
      <p style={{ color: "var(--text-muted)", marginTop: -12 }}>{contract.contract_environments?.name}</p>

      <ContractChat contractId={contractId} initialMessages={messages ?? []} />

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
