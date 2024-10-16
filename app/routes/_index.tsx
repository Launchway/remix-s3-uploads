import { json, LoaderFunction, ActionFunction } from "@remix-run/node";
import { Form, useLoaderData, useActionData, useFetcher, useRevalidator } from "@remix-run/react";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createCookieSessionStorage } from "@remix-run/node";
import { useState, useEffect } from "react";

const MAX_FILE_SIZE = 1 * 1024; // 1KB
const ALLOWED_FILE_TYPES = ["text/plain"];

// Update this function to always use the same bucket name
function createS3Client(useCloudflare: boolean) {
  return new S3Client(useCloudflare ? {
    region: "auto",
    endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.CLOUDFLARE_R2_ACCESS_SECRET_KEY!,
    },
    forcePathStyle: true,
  } : {
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

// Add this new code for session handling
const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "file_upload_session",
    secrets: [process.env.SESSION_SECRET || "default_secret"],
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  },
});

async function getSession(request: Request) {
  const cookie = request.headers.get("Cookie");
  return sessionStorage.getSession(cookie);
}

export const loader: LoaderFunction = async ({ request }) => {
  const session = await getSession(request);
  const uploadedFiles = session.get("uploadedFiles") || [];
  const useCloudflare = session.get("useCloudflare") || false;

  const s3Client = createS3Client(useCloudflare);

  const key = `uploads/${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  const bucketName = process.env.UPLOADS_BUCKET_NAME;
  
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: "application/octet-stream",
  });

  try {
    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    // Generate presigned URLs for each uploaded file
    const filesWithPresignedUrls = await Promise.all(
      uploadedFiles.map(async (file: { key: string; url: string; uploadedAt: string; originalFileName: string }) => {
        const getCommand = new GetObjectCommand({
          Bucket: bucketName,
          Key: file.key,
        });
        const presignedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
        return { ...file, presignedUrl };
      })
    );

    return json({ presignedUrl: url, key, uploadedFiles: filesWithPresignedUrls, useCloudflare });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    return json({ error: "Failed to generate upload URL", uploadedFiles, useCloudflare }, { status: 500 });
  }
};

export const action: ActionFunction = async ({ request }) => {
  const session = await getSession(request);
  const formData = await request.formData();
  const key = formData.get("key") as string;
  const originalFileName = formData.get("originalFileName") as string;
  const toggleCloudflare = formData.get("toggleCloudflare") as string;

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
    return json({ success: false, error: "No file key or original file name provided" }, { status: 400 });
  }

  const useCloudflare = session.get("useCloudflare") || false;
  const bucketName = process.env.UPLOADS_BUCKET_NAME;
  const region = useCloudflare ? "auto" : process.env.AWS_REGION;
  const fileUrl = `https://${bucketName}.${region === "auto" ? "r2.cloudflarestorage.com" : `s3.${region}.amazonaws.com`}/${key}`;

  // Add the new file to the list of uploaded files
  const uploadedFiles = session.get("uploadedFiles") || [];
  uploadedFiles.push({ key, url: fileUrl, uploadedAt: new Date().toISOString(), originalFileName });
  session.set("uploadedFiles", uploadedFiles);

  // Commit the session and return the response
  return json(
    { success: true, url: fileUrl },
    {
      headers: {
        "Set-Cookie": await sessionStorage.commitSession(session),
      },
    }
  );
};

// Add this function at the top of the file, outside of any component
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

export default function Upload() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const [useCloudflare, setUseCloudflare] = useState(loaderData.useCloudflare);

  useEffect(() => {
    setUseCloudflare(loaderData.useCloudflare);
  }, [loaderData.useCloudflare]);

  const handleToggleCloudflare = () => {
    fetcher.submit(
      { toggleCloudflare: (!useCloudflare).toString() },
      { method: "post" }
    );
  };

  useEffect(() => {
    if (fetcher.data && typeof fetcher.data === 'object' && 'success' in fetcher.data) {
      revalidator.revalidate();
    }
  }, [fetcher.data, revalidator]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem('file') as HTMLInputElement;
    const file = fileInput.files?.[0];

    if (file && loaderData.presignedUrl) {
      // Client-side validation
      if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        alert("Only .txt files are allowed.");
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        alert("File size must be less than 1KB.");
        return;
      }

      try {
        await fetch(loaderData.presignedUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });

        const formData = new FormData(form);
        formData.append('key', loaderData.key);
        formData.append('originalFileName', file.name);
        const response = await fetch(form.action, {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          fileInput.value = ''; // Clear the file input
          // Refresh the page data after successful upload
          revalidator.revalidate();
        } else {
          throw new Error('Upload failed');
        }
      } catch (error) {
        console.error('Error uploading file:', error);
        alert('Error uploading file. Please try again.');
      }
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6 text-center">S3/R2 Text File Upload Demo</h1>
      
      <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Upload Settings</h2>
          <label className="flex items-center cursor-pointer">
            <span className="mr-2">Use Cloudflare R2</span>
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={useCloudflare}
                onChange={handleToggleCloudflare}
              />
              <div className={`block w-14 h-8 rounded-full ${useCloudflare ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
              <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition ${useCloudflare ? 'transform translate-x-6' : ''}`}></div>
            </div>
          </label>
        </div>

        <h2 className="text-xl font-semibold mb-4">Generate and Download Dummy File</h2>
        <p className="mb-4">
          You can generate and download a sample text file to use in this demo:{" "}
          <a href="/generate-dummy" className="text-blue-500 hover:text-blue-700 underline">
            Generate and Download Random Dummy File
          </a>
          {" "}(A new file with a random name will be generated each time)
        </p>

        <h2 className="text-xl font-semibold mb-4">Upload File</h2>
        <Form method="post" onSubmit={handleSubmit} className="mb-4">
          <input type="file" name="file" accept=".txt" className="mb-2" />
          <button type="submit" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
            Upload to {useCloudflare ? 'Cloudflare R2' : 'AWS S3'}
          </button>
        </Form>
        <p className="text-sm text-gray-600">Only .txt files are allowed. Maximum file size: 1KB.</p>
        <p className="text-sm text-gray-600">Note: Uploaded files will be cleared regularly.</p>
        {(actionData?.error || loaderData.error) && <p className="text-red-500 mt-2">Error: {actionData?.error || loaderData.error}</p>}
      </div>

      <div className="bg-white shadow-md rounded px-8 pt-6 pb-8">
        <h2 className="text-xl font-semibold mb-4">Your Uploaded Files</h2>
        {loaderData.uploadedFiles && loaderData.uploadedFiles.length > 0 ? (
          <ul className="list-disc pl-5">
            {loaderData.uploadedFiles.map((file: { key: string; url: string; uploadedAt: string; originalFileName: string; presignedUrl: string }, index: number) => (
              <li key={index} className="mb-2">
                <a href={file.presignedUrl} download={file.originalFileName} className="text-blue-500 hover:text-blue-700">
                  {file.originalFileName}
                </a>
                {" "}
                <span className="text-sm text-gray-600">
                  (Uploaded on: {formatDate(file.uploadedAt)})
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No files uploaded yet.</p>
        )}
      </div>
    </div>
  );
}
