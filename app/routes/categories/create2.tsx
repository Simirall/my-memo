import { createRoute } from "honox/factory";
import { CreateCategoryForm } from "../../islands/categories/create-category-form";

export default createRoute((c) => {
  return c.render(
    <div className="flex justify-center p-8">
      <div className="card w-96 bg-base-100 shadow-sm">
        <div className="card-body">
          <CreateCategoryForm />
        </div>
      </div>
    </div>,
  );
});
