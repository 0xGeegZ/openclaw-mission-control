import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAccountId } from "./lib/auth";

/**
 * Generate an upload URL for a file.
 * Client calls this to get a presigned upload URL, uploads the file to Convex storage,
 * then calls registerUpload to save metadata.
 */
export const generateUploadUrl = mutation({
  args: {
    fileName: v.string(),
    mimeType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, { fileName, mimeType, size }) => {
    const accountId = await getAccountId(ctx);

    // Validate file size: max 25 MB
    if (size > 25 * 1024 * 1024) {
      throw new Error("File exceeds 25 MB limit");
    }

    // Validate fileName (basic safety check)
    if (!fileName || fileName.trim().length === 0) {
      throw new Error("File name cannot be empty");
    }

    // Get upload URL from Convex storage
    const uploadUrl = await ctx.storage.generateUploadUrl();

    return uploadUrl;
  },
});

/**
 * Register an uploaded file after Convex confirms upload success.
 * Call this after uploading to the URL returned by generateUploadUrl.
 */
export const registerUpload = mutation({
  args: {
    fileName: v.string(),
    mimeType: v.string(),
    size: v.number(),
    storageId: v.string(),
  },
  handler: async (ctx, { fileName, mimeType, size, storageId }) => {
    const accountId = await getAccountId(ctx);
    const userId = (await ctx.auth.getUserIdentity())?.tokenIdentifier || "unknown";

    // Validate inputs
    if (size > 25 * 1024 * 1024) {
      throw new Error("File exceeds 25 MB limit");
    }

    if (!storageId || storageId.trim().length === 0) {
      throw new Error("storageId required");
    }

    // Create file record in database
    const fileId = await ctx.db.insert("files", {
      accountId,
      uploadedBy: userId,
      fileName,
      mimeType,
      size,
      storageId,
      createdAt: Date.now(),
    });

    return { fileId, storageId };
  },
});

/**
 * Get a file by ID (with account isolation).
 */
export const getFileById = query({
  args: {
    fileId: v.id("files"),
  },
  handler: async (ctx, { fileId }) => {
    const accountId = await getAccountId(ctx);

    const file = await ctx.db.get(fileId);
    if (!file) {
      throw new Error("File not found");
    }

    // Enforce account isolation
    if (file.accountId !== accountId) {
      throw new Error("Unauthorized");
    }

    return file;
  },
});

/**
 * Get file download URL by storageId.
 * Called by frontend when rendering attachment download links.
 */
export const getDownloadUrl = query({
  args: {
    storageId: v.string(),
  },
  handler: async (ctx, { storageId }) => {
    // Get the file metadata to verify account access
    const files = await ctx.db
      .query("files")
      .filter((q) => q.eq(q.field("storageId"), storageId))
      .collect();

    if (files.length === 0) {
      throw new Error("File not found");
    }

    const file = files[0];
    const accountId = await getAccountId(ctx);

    // Enforce account isolation
    if (file.accountId !== accountId) {
      throw new Error("Unauthorized");
    }

    // Get download URL from Convex storage
    const downloadUrl = await ctx.storage.getUrl(storageId);
    return downloadUrl;
  },
});
