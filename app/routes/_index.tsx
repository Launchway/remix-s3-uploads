import { json, LoaderFunction, ActionFunction } from "@remix-run/node";
import { Form, useLoaderData, useActionData, useFetcher, useRevalidator } from "@remix-run/react";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { useState, useEffect } from "react";
import { formatDate } from "../lib/date";
import { getSession, sessionStorage } from "../lib/sessions";
// Add these imports
import awsLogo from "../images/s3.png";
import cloudflareLogo from "../images/cloudflare.png";

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
      
      <div className="bg-white border rounded-lg px-8 pt-6 pb-8 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold">Upload Settings</h2>
          <div className="flex items-center">
            <img src={awsLogo} alt="AWS S3" className="h-8 mr-2" />
            <label className="flex items-center cursor-pointer">
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
            <img src={cloudflareLogo} alt="Cloudflare R2" className="h-8 ml-2" />
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Generate Dummy File</h2>
          <p className="mb-3">
            Generate a sample text file to use in this demo:
          </p>
          <a 
            href="/generate-dummy" 
            className="inline-block bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded transition duration-300"
          >
            Generate Random Dummy File
          </a>
          <p className="mt-2 text-sm text-gray-600">
            (A new file with a random name will be generated each time)
          </p>
        </div>

        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-3">Upload File</h2>
          <Form method="post" onSubmit={handleSubmit} className="mb-3">
            <input type="file" name="file" accept=".txt" className="mb-3 w-full" />
            <button type="submit" className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded transition duration-300">
              Upload to {useCloudflare ? 'Cloudflare R2' : 'AWS S3'}
            </button>
          </Form>
          <p className="text-sm text-gray-600">Only .txt files are allowed. Maximum file size: 1KB.</p>
          <p className="text-sm text-gray-600">Note: Uploaded files will be cleared regularly.</p>
          {(actionData?.error || loaderData.error) && <p className="text-red-500 mt-2">Error: {actionData?.error || loaderData.error}</p>}
        </div>
      </div>

      <div className="bg-white border rounded-lg px-8 pt-6 pb-8">
        <h2 className="text-2xl font-semibold mb-4">Your Uploaded Files</h2>
        {loaderData.uploadedFiles && loaderData.uploadedFiles.length > 0 ? (
          <ul className="space-y-2">
            {loaderData.uploadedFiles.map((file: { key: string; url: string; uploadedAt: string; originalFileName: string; presignedUrl: string }, index: number) => (
              <li key={index} className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div>
                  <a href={file.presignedUrl} download={file.originalFileName} className="text-blue-500 hover:text-blue-700 font-medium">
                    {file.originalFileName}
                  </a>
                  <span className="text-sm text-gray-600 ml-2">
                    (Uploaded on: {formatDate(file.uploadedAt)})
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-600">No files uploaded yet.</p>
        )}
      </div>
    </div>
  );
}
