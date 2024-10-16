import { json, LoaderFunction, ActionFunction } from "@remix-run/node";
import { Form, useLoaderData, useActionData } from "@remix-run/react";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const loader: LoaderFunction = async () => {
  const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
  const key = `uploads/${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  const command = new PutObjectCommand({
    Bucket: process.env.UPLOADS_BUCKET_NAME,
    Key: key,
    ContentType: "application/octet-stream",
  });

  try {
    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return json({ presignedUrl: url, key });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    return json({ error: "Failed to generate upload URL" }, { status: 500 });
  }
};

export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData();
  const key = formData.get("key") as string;

  if (!key) {
    return json({ success: false, error: "No file key provided" }, { status: 400 });
  }

  const fileUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  return json({ success: true, url: fileUrl });
};

export default function Upload() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem('file') as HTMLInputElement;
    const file = fileInput.files?.[0];

    if (file && loaderData.presignedUrl) {
      try {
        await fetch(loaderData.presignedUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });

        const formData = new FormData(form);
        formData.append('key', loaderData.key);
        await fetch(form.action, {
          method: 'POST',
          body: formData,
        });

        // Reload the page to see the result
        window.location.reload();
      } catch (error) {
        console.error('Error uploading file:', error);
      }
    }
  };

  return (
    <div>
      <h1>S3 File Upload with Presigned URL</h1>
      <Form method="post" onSubmit={handleSubmit}>
        <input type="file" name="file" />
        <button type="submit">Upload</button>
      </Form>
      {actionData?.success && (
        <p>File uploaded successfully. <a href={actionData.url} target="_blank" rel="noopener noreferrer">View file</a></p>
      )}
      {(actionData?.error || loaderData.error) && <p>Error: {actionData?.error || loaderData.error}</p>}
    </div>
  );
}