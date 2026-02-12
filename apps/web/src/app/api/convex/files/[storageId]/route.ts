import { NextRequest, NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@packages/backend/convex/_generated/api";

/**
 * GET /api/convex/files/[storageId]
 * 
 * Downloads a file from Convex storage with account isolation.
 * Uses files.getDownloadUrl to verify account access and retrieve the Convex storage URL.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storageId: string }> }
) {
  const { storageId } = await params;

  if (!storageId) {
    return NextResponse.json(
      { error: "storageId required" },
      { status: 400 }
    );
  }

  try {
    // Verify account access and get download URL from Convex
    const downloadUrl = await fetchQuery(api.files.getDownloadUrl, {
      storageId,
    });

    if (!downloadUrl) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    // Redirect to the Convex storage URL
    // The URL is already authenticated and account-scoped by files.getDownloadUrl
    return NextResponse.redirect(downloadUrl, { status: 307 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    // Return 404 for file not found or unauthorized access
    if (message.includes("not found") || message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: "File not found or access denied" },
        { status: 404 }
      );
    }

    // Log unexpected errors but don't leak details to client
    console.error("Download endpoint error:", error);
    return NextResponse.json(
      { error: "Failed to download file" },
      { status: 500 }
    );
  }
}
