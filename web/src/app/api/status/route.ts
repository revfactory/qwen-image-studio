import { NextResponse } from "next/server";
import { engineStatus } from "@/lib/server/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await engineStatus());
}
