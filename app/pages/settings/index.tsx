import { redirect } from "@/server/request-context";

export default () => redirect("/settings/account");

export const getConfig = () => ({ render: "dynamic" as const });
