import { ActionFunction, json, LoaderFunction } from "@remix-run/node";
import {
  Form,
  useActionData,
  useFetcher,
  useLoaderData,
  useRevalidator,
} from "@remix-run/react";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { useEffect, useState } from "react";
import { getSession, sessionStorage } from "../lib/sessions";
// Add this import
import * as crypto from "crypto";
import { UploadDestinationToggle } from "~/components/upload-destination-toggle";
import { UserSessionInfo } from "~/components/user-session-info";
import { DummyFileGenerator } from "~/components/dummy-file-generator";
import { UploadedFilesList } from "~/components/uploaded-files-list";
import { getBucketPathPrefix } from "~/lib/uploads";

const MAX_FILE_SIZE = 1 * 1024; // 1KB
const ALLOWED_FILE_TYPES = ["text/plain"];

function createS3Client(useCloudflare: boolean) {
  return new S3Client(
    useCloudflare
      ? {
          region: "auto",
          endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
          credentials: {
            accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
            secretAccessKey: process.env.CLOUDFLARE_R2_ACCESS_SECRET_KEY!,
          },
          forcePathStyle: true,
        }
      : {
          region: process.env.AWS_REGION,
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          },
        }
  );
}

export const loader: LoaderFunction = async ({ request }) => {
  const session = await getSession(request);
  const uploadedFiles = session.get("uploadedFiles") || [];
  const useCloudflare = session.get("useCloudflare") || false;

  let userId = session.get("userId");
  if (!userId) {
    userId = crypto.randomUUID();
    session.set("userId", userId);
  }

  const s3Client = createS3Client(useCloudflare);

  const key = `${getBucketPathPrefix(userId)}/${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 15)}`;
  const bucketName = process.env.UPLOADS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error(
      "UPLOADS_BUCKET_NAME is not defined in the environment variables"
    );
  }

  try {
    const { url, fields } = await createPresignedPost(s3Client, {
      Bucket: bucketName,
      Key: key,
      Conditions: [
        ["content-length-range", 0, MAX_FILE_SIZE],
        ["eq", "$Content-Type", ALLOWED_FILE_TYPES.join(",")],
        ["starts-with", "$key", getBucketPathPrefix(userId)],
      ],
      Expires: 3600,
    });

    // Generate presigned URLs for each uploaded file
    const filesWithPresignedUrls = await Promise.all(
      uploadedFiles.map(
        async (file: {
          key: string;
          url: string;
          uploadedAt: string;
          originalFileName: string;
        }) => {
          const getCommand = new GetObjectCommand({
            Bucket: bucketName,
            Key: file.key,
          });
          const presignedUrl = await getSignedUrl(s3Client, getCommand, {
            expiresIn: 3600,
          });
          return { ...file, presignedUrl };
        }
      )
    );

    return json(
      {
        presignedUrl: url,
        fields,
        key,
        uploadedFiles: filesWithPresignedUrls,
        useCloudflare,
        userId,
      },
      {
        headers: {
          "Set-Cookie": await sessionStorage.commitSession(session),
        },
      }
    );
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    return json(
      {
        error: "Failed to generate upload URL",
        uploadedFiles,
        useCloudflare,
        userId,
      },
      { status: 500 }
    );
  }
};

export const action: ActionFunction = async ({ request }) => {
  const session = await getSession(request);
  const formData = await request.formData();
  const key = formData.get("key") as string;
  const originalFileName = formData.get("originalFileName") as string;
  const toggleCloudflare = formData.get("toggleCloudflare") as string;

  console.log("action", { key, originalFileName, toggleCloudflare });
  if (toggleCloudflare) {
    const useCloudflare = toggleCloudflare === "true";
    session.set("useCloudflare", useCloudflare);
    return json(
      { success: true, useCloudflare },
      {
        headers: {
          "Set-Cookie": await sessionStorage.commitSession(session),
        },
      }
    );
  }

  if (!key || !originalFileName) {
    return json(
      { success: false, error: "No file key or original file name provided" },
      { status: 400 }
    );
  }

  const useCloudflare = session.get("useCloudflare") || false;
  const bucketName = process.env.UPLOADS_BUCKET_NAME;
  const region = useCloudflare ? "auto" : process.env.AWS_REGION;
  const fileUrl = `https://${bucketName}.${
    region === "auto"
      ? "r2.cloudflarestorage.com"
      : `s3.${region}.amazonaws.com`
  }/${key}`;

  // Add the new file to the list of uploaded files
  const uploadedFiles = session.get("uploadedFiles") || [];
  uploadedFiles.push({
    key,
    url: fileUrl,
    uploadedAt: new Date().toISOString(),
    originalFileName,
  });
  session.set("uploadedFiles", uploadedFiles);

  console.log("Updated uploadedFiles:", uploadedFiles);

  // Commit the session and return the response
  return json(
    { success: true, url: fileUrl, uploadedFiles },
    {
      headers: {
        "Set-Cookie": await sessionStorage.commitSession(session),
      },
    }
  );
};

export default function Upload() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const [useCloudflare, setUseCloudflare] = useState<boolean>(
    loaderData.useCloudflare
  );

  useEffect(() => {
    setUseCloudflare(loaderData.useCloudflare);
  }, [loaderData.useCloudflare]);

  const handleToggleCloudflare = () => {
    fetcher.submit(
      { toggleCloudflare: (!useCloudflare).toString() },
      { method: "post" }
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput.files?.[0];

    if (file && loaderData.presignedUrl) {
      // Client-side validation
      if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        alert(`Only ${ALLOWED_FILE_TYPES.join(", ")} files are allowed.`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        alert("File size must be less than 1KB.");
        return;
      }

      try {
        const formData = new FormData();
        Object.entries(loaderData.fields).forEach(([key, value]) => {
          formData.append(key, value as string);
        });

        // Set the Content-Type field explicitly
        formData.set("Content-Type", file.type);

        // Append the file last
        formData.append("file", file, file.name);

        await fetch(loaderData.presignedUrl, {
          method: "POST",
          body: formData,
        });

        const formData2 = new FormData(form);
        formData2.append("key", loaderData.key);
        formData2.append("originalFileName", file.name);
        const response2 = await fetch(form.action, {
          method: "POST",
          body: formData2,
        });

        if (response2.ok) {
          // const result = await response2.json();
          // console.log('Upload success, updated files:', result.uploadedFiles);
          fileInput.value = ""; // Clear the file input
          // Refresh the page data after successful upload
          revalidator.revalidate();
        } else {
          throw new Error("Upload failed");
        }
      } catch (error) {
        console.error("Error uploading file:", error);
        alert("Error uploading file. Please try again.");
      }
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6 text-center">
        Remix S3/R2 Text File Upload Demo
      </h1>

      <div className="bg-white border rounded-lg px-8 pt-6 pb-8 mb-6 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Upload Settings</h2>
          <UploadDestinationToggle
            handleToggleCloudflare={handleToggleCloudflare}
            useCloudflare={useCloudflare}
          />
        </div>
        <UserSessionInfo userId={loaderData.userId} />
        <DummyFileGenerator />
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-3">Upload File</h2>
          <Form method="post" onSubmit={handleSubmit} className="mb-3">
            <input
              type="file"
              name="file"
              accept=".txt"
              className="mb-3 w-full"
            />
            <button
              type="submit"
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded transition duration-300"
            >
              Upload to {useCloudflare ? "Cloudflare R2" : "AWS S3"}
            </button>
          </Form>
          <p className="text-sm text-gray-600">
            Only {ALLOWED_FILE_TYPES.join(",")} files are allowed. Maximum file
            size: 1KB.
          </p>
          <p className="text-sm text-gray-600">
            Note: Uploaded files will be cleared regularly.
          </p>
          {(actionData?.error || loaderData.error) && (
            <p className="text-red-500 mt-2">
              Error: {actionData?.error || loaderData.error}
            </p>
          )}
        </div>
      </div>
      <UploadedFilesList uploadedFiles={loaderData.uploadedFiles} />
    </div>
  );
}
