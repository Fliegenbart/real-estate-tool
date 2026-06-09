import { DealDetailView } from "../../../components/DealDetailView";

export default function Page({ params }: { params: { id: string } }) {
  return <DealDetailView dealId={params.id} />;
}
