import { json, LoaderFunction } from "@remix-run/node";
import { useLoaderData, Outlet } from "@remix-run/react";
import { getSession, commitSession } from "../lib/sessions.server";
import * as crypto from "crypto";
import { UserSessionInfo } from "~/components/user-session-info";
import { DummyFileGenerator } from "~/components/dummy-file-generator";
import { UploadedFilesList } from "~/components/uploaded-files-list";
import { UploadDestinationTabs } from "~/components/upload-destination-tabs";

export const loader: LoaderFunction = async ({ request }) => {
  const session = await getSession(request);

  let userId = session.get("userId");
  if (!userId) {
    userId = crypto.randomUUID();
    session.set("userId", userId);
  }

  return json(
    {
      userId,
    },
    {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    }
  );
};

export default function Upload() {
  const loaderData = useLoaderData<typeof loader>();

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6 text-center">
        Remix S3/R2 Text File Upload Demo
      </h1>

      <div className="bg-white rounded-lg px-8 pt-6 pb-8 mb-6 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Upload Settings</h2>
        </div>
        <UserSessionInfo userId={loaderData.userId} />
        <DummyFileGenerator />
        <UploadDestinationTabs />
        <Outlet />
      </div>
    </div>
  );
}
