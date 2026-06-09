import { MemoView } from "../../../components/MemoView";

export default function Page({ params }: { params: { id: string } }) {
  return <MemoView dealId={params.id} />;
}
