import { NavLink } from "@remix-run/react";
import awsLogo from "~/images/s3.png";
import cloudflareLogo from "~/images/cloudflare.png";
import hetznerLogo from "~/images/hetzner.png";

export const UploadDestinationTabs = () => {
  return (
    <div className="flex items-center space-x-2">
      <NavLink
        to="/s3"
        className={({ isActive }) =>
          `flex w-1/3 items-center justify-center px-3 py-2 rounded-md ${
            isActive ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700"
          }`
        }
      >
        <img src={awsLogo} alt="AWS S3" className="h-6 mr-2" />
        <span>AWS S3</span>
      </NavLink>
      <NavLink
        to="/cloudflare"
        className={({ isActive }) =>
          `flex w-1/3 items-center justify-center px-3 py-2 rounded-md ${
            isActive ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700"
          }`
        }
      >
        <img src={cloudflareLogo} alt="Cloudflare R2" className="h-6 mr-2" />
        <span>Cloudflare R2</span>
      </NavLink>
      <NavLink
        to="/hetzner"
        className={({ isActive }) =>
          `flex w-1/3 items-center justify-center px-3 py-2 rounded-md ${
            isActive ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700"
          }`
        }
      >
        <img src={hetznerLogo} alt="Hetzner" className="h-6 mr-2" />
        <span>Hetzner</span>
      </NavLink>
    </div>
  );
};
