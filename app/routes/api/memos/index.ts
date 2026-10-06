import { Hono } from "hono";
import attachmentsRoute from "./-routes/attachments";
import bulkRoute from "./-routes/bulk";
import classificationRoute from "./-routes/classification";
import createRoute from "./-routes/create";
import deleteRoute from "./-routes/delete";
import summaryRoute from "./-routes/summary";
import tagsRoute from "./-routes/tags";
import updateRoute from "./-routes/update";

const memosRoute = new Hono<{ Bindings: CloudflareBindings }>();

memosRoute
  .route("/", createRoute)
  .route("/", bulkRoute)
  .route("/", attachmentsRoute)
  .route("/", updateRoute)
  .route("/", deleteRoute)
  .route("/", tagsRoute)
  .route("/", summaryRoute)
  .route("/", classificationRoute);

export default memosRoute;
