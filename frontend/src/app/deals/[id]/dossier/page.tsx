import { NegotiationView } from "../../../../components/NegotiationView";

export default function Page({ params }: { params: { id: string } }) {
  return <NegotiationView dealId={params.id} />;
}
