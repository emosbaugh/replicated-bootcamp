import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const startTime = Date.now();

export async function GET() {
  let dbStatus: "ok" | "error" = "ok";
  let dbError: string | undefined;

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    dbStatus = "error";
    dbError = err instanceof Error ? err.message : "unknown error";
  }

  const healthy = dbStatus === "ok";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      checks: {
        database: {
          status: dbStatus,
          ...(dbError ? { error: dbError } : {}),
        },
      },
    },
    { status: healthy ? 200 : 503 }
  );
}
