import { LoaderFunction, json, ActionFunction } from "@remix-run/node";
import {
  useLoaderData,
  useActionData,
  useFetcher,
} from "@remix-run/react";
import {
  createS3Client,
  generateFileKey,
  generatePresignedUrlsForExistingUploads,
} from "~/lib/uploads";
import { getSession, commitSession } from "../lib/sessions.server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { UploadedFilesList } from "~/components/uploaded-files-list";
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from "~/constants";
import { FileLimits } from "~/components/file-limits";

export const loader: LoaderFunction = async ({ request }) => {
  const session = await getSession(request);
  let userId = session.get("userId");
  if (!userId) {
    userId = crypto.randomUUID();
    session.set("userId", userId);
  }
  const s3Client = createS3Client("cloudflare");

  const key = generateFileKey(userId);
  const bucketName = process.env.UPLOADS_BUCKET_NAME!;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: ALLOWED_FILE_TYPES[0],
  });
  const url = await getSignedUrl(s3Client, command, {
    expiresIn: 3600,
  });

  const uploadedFiles = session.get("cloudflareUploadedFiles") || [];

  const filesWithPresignedUrls = await generatePresignedUrlsForExistingUploads({
    s3Client,
    bucketName,
    uploadedFiles,
  });

  return json({
    presignedUrl: url,
    key,
    uploadedFiles: filesWithPresignedUrls,
  });
};

export const action: ActionFunction = async ({ request }) => {
  const session = await getSession(request);
  const formData = await request.formData();
  const key = formData.get("key") as string;
  const originalFileName = formData.get("originalFileName") as string;

  const uploadedFiles = session.get("cloudflareUploadedFiles") || [];
  uploadedFiles.push({
    key,
    uploadedAt: new Date().toISOString(),
    originalFileName,
  });

  session.set("cloudflareUploadedFiles", uploadedFiles);

  return json(
    { success: true },
    {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    }
  );
};

export default function CloudflareUpload() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const fetcher = useFetcher();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput.files?.[0];

    if (file && loaderData.presignedUrl) {
      if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        alert(`Only ${ALLOWED_FILE_TYPES.join(", ")} files are allowed.`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        alert("File size must be less than 1KB.");
        return;
      }

      try {
        await fetch(loaderData.presignedUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type,
          },
        });

        const formData = new FormData(form);
        formData.append("key", loaderData.key);
        formData.append("originalFileName", file.name);
        fetcher.submit(formData, { method: "post" });
        fileInput.value = ""; // Clear the file input
      } catch (error) {
        console.error("Error uploading file:", error);
        alert("Error uploading file. Please try again.");
      }
    }
  };

  return (
    <div className="mb-6">
      <h2 className="text-xl font-semibold mb-3">
        Upload File to Cloudflare R2
      </h2>
      <form onSubmit={handleSubmit} className="mb-3">
        <input type="file" name="file" accept=".txt" className="mb-3 w-full" />
        <button
          type="submit"
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded transition duration-300"
        >
          Upload to Cloudflare R2
        </button>
      </form>
      <FileLimits />
      {actionData?.error && (
        <p className="text-red-500 mt-2">Error: {actionData.error}</p>
      )}
      <UploadedFilesList uploadedFiles={loaderData.uploadedFiles} />
    </div>
  );
}
