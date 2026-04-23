// src/app/api/universe/route.ts

import { NextResponse } from "next/server"
import { buildRawListedUniverse } from "@/lib/universe"

export async function GET() {
  try {
    const universe = await buildRawListedUniverse()

    return NextResponse.json({
      ok: true,
      count: universe.length,
      universe,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown universe build error"

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    )
  }
}
