import { randomUUID } from "node:crypto";
import type { Sql } from "@line_bot_v1/platform/postgres";
import type {
  ProjectField,
  ProjectFieldIteration,
  ProjectFieldOption,
  ProjectFieldValue,
  ProjectItemFieldValue,
  ProjectManagementCommand,
} from "../../../contracts/management.js";
import type {
  ProjectFieldDataType,
  ProjectOptionColor,
} from "../../../domain.js";
import { ProjectError } from "../../../domain.js";

type FieldRow = {
  id: string;
  project_id: string;
  name: string;
  data_type: ProjectFieldDataType;
  version: number | string;
  created_at: number | string;
  updated_at: number | string;
};

type OptionRow = {
  id: string;
  field_id: string;
  option_kind: "SINGLE_SELECT" | "MULTI_SELECT";
  name: string;
  color: ProjectOptionColor;
  description: string;
  position: number | string;
  version: number | string;
};

type IterationRow = {
  id: string;
  field_id: string;
  title: string;
  start_date: string;
  duration: number | string;
  position: number | string;
  version: number | string;
};

type ValueRow = {
  project_id: string;
  item_id: string;
  field_id: string;
  value_type: Exclude<ProjectFieldDataType, "MULTI_SELECT"> | "MULTI_SELECT";
  date_value: string | null;
  iteration_id: string | null;
  number_value: number | string | null;
  single_select_option_id: string | null;
  text_value: string | null;
  version: number | string;
  updated_at: number | string;
};

function fieldOption(row: OptionRow): ProjectFieldOption {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    description: row.description,
    position: Number(row.position),
    version: Number(row.version),
  };
}

function fieldIteration(row: IterationRow): ProjectFieldIteration {
  return {
    id: row.id,
    title: row.title,
    startDate: row.start_date,
    duration: Number(row.duration),
    position: Number(row.position),
    version: Number(row.version),
  };
}

function field(
  row: FieldRow,
  options: readonly OptionRow[],
  iterations: readonly IterationRow[],
): ProjectField {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    dataType: row.data_type,
    options: options.map(fieldOption),
    iterations: iterations.map(fieldIteration),
    version: Number(row.version),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

async function fieldRows(sql: Sql, projectId: string): Promise<FieldRow[]> {
  return (
    await sql.query(
      `SELECT *
       FROM project_fields
       WHERE project_id=$1
       ORDER BY lower(name),id`,
      [projectId],
    )
  ).rows as FieldRow[];
}

async function optionRows(sql: Sql, fieldIds: readonly string[]): Promise<OptionRow[]> {
  if (!fieldIds.length) return [];
  return (
    await sql.query(
      `SELECT *
       FROM project_field_options
       WHERE field_id=ANY($1::text[])
       ORDER BY field_id,position,id`,
      [fieldIds],
    )
  ).rows as OptionRow[];
}

async function iterationRows(sql: Sql, fieldIds: readonly string[]): Promise<IterationRow[]> {
  if (!fieldIds.length) return [];
  return (
    await sql.query(
      `SELECT *
       FROM project_field_iterations
       WHERE field_id=ANY($1::text[])
       ORDER BY field_id,position,id`,
      [fieldIds],
    )
  ).rows as IterationRow[];
}

export async function readProjectFields(sql: Sql, projectId: string): Promise<ProjectField[]> {
  const fields = await fieldRows(sql, projectId);
  const ids = fields.map((row) => row.id);
  const [options, iterations] = await Promise.all([
    optionRows(sql, ids),
    iterationRows(sql, ids),
  ]);
  const optionsByField = new Map<string, OptionRow[]>();
  const iterationsByField = new Map<string, IterationRow[]>();
  for (const row of options) {
    const values = optionsByField.get(row.field_id) ?? [];
    values.push(row);
    optionsByField.set(row.field_id, values);
  }
  for (const row of iterations) {
    const values = iterationsByField.get(row.field_id) ?? [];
    values.push(row);
    iterationsByField.set(row.field_id, values);
  }
  return fields.map((row) =>
    field(row, optionsByField.get(row.id) ?? [], iterationsByField.get(row.id) ?? []),
  );
}

export async function readProjectFieldValues(
  sql: Sql,
  projectId: string,
  visibleItemIds: readonly string[],
): Promise<ProjectItemFieldValue[]> {
  if (!visibleItemIds.length) return [];
  const rows = (
    await sql.query(
      `SELECT *
       FROM project_item_field_values
       WHERE project_id=$1 AND item_id=ANY($2::text[])
       ORDER BY item_id,field_id`,
      [projectId, visibleItemIds],
    )
  ).rows as ValueRow[];
  const multiRows = (
    await sql.query(
      `SELECT item_id,field_id,option_id
       FROM project_item_multi_select_values
       WHERE project_id=$1 AND item_id=ANY($2::text[])
       ORDER BY item_id,field_id,option_id`,
      [projectId, visibleItemIds],
    )
  ).rows as Array<{ item_id: string; field_id: string; option_id: string }>;
  const multi = new Map<string, string[]>();
  for (const row of multiRows) {
    const key = `${row.item_id}\0${row.field_id}`;
    const values = multi.get(key) ?? [];
    values.push(row.option_id);
    multi.set(key, values);
  }

  return rows.map((row) => {
    let value: ProjectFieldValue;
    if (row.value_type === "DATE" && row.date_value !== null) {
      value = { type: "DATE", date: row.date_value };
    } else if (row.value_type === "ITERATION" && row.iteration_id !== null) {
      value = { type: "ITERATION", iterationId: row.iteration_id };
    } else if (row.value_type === "MULTI_SELECT") {
      value = {
        type: "MULTI_SELECT",
        optionIds: multi.get(`${row.item_id}\0${row.field_id}`) ?? [],
      };
    } else if (row.value_type === "NUMBER" && row.number_value !== null) {
      value = { type: "NUMBER", number: Number(row.number_value) };
    } else if (row.value_type === "SINGLE_SELECT" && row.single_select_option_id !== null) {
      value = { type: "SINGLE_SELECT", optionId: row.single_select_option_id };
    } else if (row.value_type === "TEXT" && row.text_value !== null) {
      value = { type: "TEXT", text: row.text_value };
    } else {
      throw new ProjectError(503, "Project typed field value 無法讀取。");
    }
    return {
      itemId: row.item_id,
      fieldId: row.field_id,
      value,
      version: Number(row.version),
      updatedAt: Number(row.updated_at),
    };
  });
}

async function currentField(sql: Sql, projectId: string, fieldId: string): Promise<FieldRow> {
  const row = (
    await sql.query(
      `SELECT *
       FROM project_fields
       WHERE project_id=$1 AND id=$2
       FOR UPDATE`,
      [projectId, fieldId],
    )
  ).rows[0] as FieldRow | undefined;
  if (!row) throw new ProjectError(404, "找不到 Project field。");
  return row;
}

function requireFieldVersion(row: FieldRow, expectedVersion: number) {
  if (Number(row.version) !== expectedVersion) {
    throw new ProjectError(409, "Project field 已更新，請重新讀取後再操作。");
  }
}

function validateFieldShape(
  dataType: ProjectFieldDataType,
  options: readonly unknown[],
  iterations: readonly unknown[],
) {
  if (dataType === "SINGLE_SELECT" || dataType === "MULTI_SELECT") {
    if (!options.length || iterations.length) {
      throw new ProjectError(400, "Select field 必須提供 options 且不能提供 iterations。");
    }
    return;
  }
  if (dataType === "ITERATION") {
    if (options.length) throw new ProjectError(400, "Iteration field 不能提供 options。");
    return;
  }
  if (options.length || iterations.length) {
    throw new ProjectError(400, "此 field dataType 不接受 options/iterations。");
  }
}

async function insertOptions(
  sql: Sql,
  fieldId: string,
  kind: "SINGLE_SELECT" | "MULTI_SELECT",
  values: readonly {
    id?: string;
    name: string;
    color: ProjectOptionColor;
    description: string;
  }[],
) {
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index]!;
    await sql.query(
      `INSERT INTO project_field_options(
         id,field_id,option_kind,name,color,description,position,version
       ) VALUES($1,$2,$3,$4,$5,$6,$7,1)`,
      [
        item.id ?? randomUUID(),
        fieldId,
        kind,
        item.name,
        item.color,
        item.description,
        index,
      ],
    );
  }
}

async function insertIterations(
  sql: Sql,
  fieldId: string,
  values: readonly {
    id?: string;
    title: string;
    startDate: string;
    duration: number;
  }[],
) {
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index]!;
    await sql.query(
      `INSERT INTO project_field_iterations(
         id,field_id,title,start_date,duration,position,version
       ) VALUES($1,$2,$3,$4,$5,$6,1)`,
      [item.id ?? randomUUID(), fieldId, item.title, item.startDate, item.duration, index],
    );
  }
}

async function replaceOptions(
  sql: Sql,
  field: FieldRow,
  values: readonly {
    id?: string;
    name: string;
    color: ProjectOptionColor;
    description: string;
  }[],
) {
  if (!values.length) return;
  if (field.data_type !== "SINGLE_SELECT" && field.data_type !== "MULTI_SELECT") {
    throw new ProjectError(400, "此 Project field 不支援 options。");
  }
  const existing = await optionRows(sql, [field.id]);
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const keep = new Set<string>();
  for (let index = 0; index < values.length; index += 1) {
    const input = values[index]!;
    if (input.id) {
      const before = existingById.get(input.id);
      if (!before) throw new ProjectError(409, "Option identity 不屬於此 Project field。");
      keep.add(before.id);
      const changed =
        before.name !== input.name ||
        before.color !== input.color ||
        before.description !== input.description ||
        Number(before.position) !== index;
      if (changed) {
        await sql.query(
          `UPDATE project_field_options
           SET name=$3,color=$4,description=$5,position=$6,version=version+1
           WHERE field_id=$1 AND id=$2`,
          [field.id, before.id, input.name, input.color, input.description, index],
        );
      }
    } else {
      const id = randomUUID();
      keep.add(id);
      await sql.query(
        `INSERT INTO project_field_options(
           id,field_id,option_kind,name,color,description,position,version
         ) VALUES($1,$2,$3,$4,$5,$6,$7,1)`,
        [
          id,
          field.id,
          field.data_type,
          input.name,
          input.color,
          input.description,
          index,
        ],
      );
    }
  }

  const removed = existing.filter((row) => !keep.has(row.id));
  if (removed.length) {
    const removedIds = removed.map((row) => row.id);
    const inUse = (
      await sql.query(
        `SELECT 1
         FROM project_item_field_values
         WHERE field_id=$1 AND single_select_option_id=ANY($2::text[])
         UNION ALL
         SELECT 1
         FROM project_item_multi_select_values
         WHERE field_id=$1 AND option_id=ANY($2::text[])
         LIMIT 1`,
        [field.id, removedIds],
      )
    ).rows[0];
    if (inUse) {
      throw new ProjectError(409, "Option 仍被 Project item value 使用，不能移除。");
    }
    await sql.query(
      "DELETE FROM project_field_options WHERE field_id=$1 AND id=ANY($2::text[])",
      [field.id, removedIds],
    );
  }
}

async function replaceIterations(
  sql: Sql,
  field: FieldRow,
  values: readonly {
    id?: string;
    title: string;
    startDate: string;
    duration: number;
  }[],
) {
  if (!values.length) return;
  if (field.data_type !== "ITERATION") {
    throw new ProjectError(400, "此 Project field 不支援 iterations。");
  }
  const existing = await iterationRows(sql, [field.id]);
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const keep = new Set<string>();
  for (let index = 0; index < values.length; index += 1) {
    const input = values[index]!;
    if (input.id) {
      const before = existingById.get(input.id);
      if (!before) throw new ProjectError(409, "Iteration identity 不屬於此 Project field。");
      keep.add(before.id);
      const changed =
        before.title !== input.title ||
        before.start_date !== input.startDate ||
        Number(before.duration) !== input.duration ||
        Number(before.position) !== index;
      if (changed) {
        await sql.query(
          `UPDATE project_field_iterations
           SET title=$3,start_date=$4,duration=$5,position=$6,version=version+1
           WHERE field_id=$1 AND id=$2`,
          [field.id, before.id, input.title, input.startDate, input.duration, index],
        );
      }
    } else {
      const id = randomUUID();
      keep.add(id);
      await sql.query(
        `INSERT INTO project_field_iterations(
           id,field_id,title,start_date,duration,position,version
         ) VALUES($1,$2,$3,$4,$5,$6,1)`,
        [id, field.id, input.title, input.startDate, input.duration, index],
      );
    }
  }

  const removed = existing.filter((row) => !keep.has(row.id));
  if (removed.length) {
    const ids = removed.map((row) => row.id);
    const inUse = (
      await sql.query(
        `SELECT 1
         FROM project_item_field_values
         WHERE field_id=$1 AND iteration_id=ANY($2::text[])
         LIMIT 1`,
        [field.id, ids],
      )
    ).rows[0];
    if (inUse) {
      throw new ProjectError(409, "Iteration 仍被 Project item value 使用，不能移除。");
    }
    await sql.query(
      "DELETE FROM project_field_iterations WHERE field_id=$1 AND id=ANY($2::text[])",
      [field.id, ids],
    );
  }
}

async function requireItem(sql: Sql, projectId: string, itemId: string) {
  const row = (
    await sql.query(
      "SELECT 1 FROM project_items WHERE project_id=$1 AND id=$2",
      [projectId, itemId],
    )
  ).rows[0];
  if (!row) throw new ProjectError(404, "找不到 Project item。");
}

async function requireOption(
  sql: Sql,
  fieldId: string,
  optionId: string,
  kind: "SINGLE_SELECT" | "MULTI_SELECT",
) {
  const row = (
    await sql.query(
      `SELECT 1
       FROM project_field_options
       WHERE field_id=$1 AND id=$2 AND option_kind=$3`,
      [fieldId, optionId, kind],
    )
  ).rows[0];
  if (!row) throw new ProjectError(409, "Project field option 不合法。");
}

async function requireIteration(sql: Sql, fieldId: string, iterationId: string) {
  const row = (
    await sql.query(
      "SELECT 1 FROM project_field_iterations WHERE field_id=$1 AND id=$2",
      [fieldId, iterationId],
    )
  ).rows[0];
  if (!row) throw new ProjectError(409, "Project iteration 不合法。");
}

async function currentValueVersion(
  sql: Sql,
  projectId: string,
  itemId: string,
  fieldId: string,
): Promise<number> {
  const row = (
    await sql.query(
      `SELECT version
       FROM project_item_field_values
       WHERE project_id=$1 AND item_id=$2 AND field_id=$3
       FOR UPDATE`,
      [projectId, itemId, fieldId],
    )
  ).rows[0] as { version: number | string } | undefined;
  return row ? Number(row.version) : 0;
}

async function upsertValue(
  sql: Sql,
  projectId: string,
  itemId: string,
  fieldId: string,
  value: ProjectFieldValue,
  now: number,
) {
  const previousVersion = await currentValueVersion(sql, projectId, itemId, fieldId);
  await sql.query(
    "DELETE FROM project_item_multi_select_values WHERE project_id=$1 AND item_id=$2 AND field_id=$3",
    [projectId, itemId, fieldId],
  );

  let dateValue: string | null = null;
  let iterationId: string | null = null;
  let numberValue: number | null = null;
  let singleSelectOptionId: string | null = null;
  let textValue: string | null = null;

  if (value.type === "DATE") {
    dateValue = value.date;
  } else if (value.type === "ITERATION") {
    await requireIteration(sql, fieldId, value.iterationId);
    iterationId = value.iterationId;
  } else if (value.type === "MULTI_SELECT") {
    for (const optionId of value.optionIds) {
      await requireOption(sql, fieldId, optionId, "MULTI_SELECT");
    }
  } else if (value.type === "NUMBER") {
    numberValue = value.number;
  } else if (value.type === "SINGLE_SELECT") {
    await requireOption(sql, fieldId, value.optionId, "SINGLE_SELECT");
    singleSelectOptionId = value.optionId;
  } else {
    textValue = value.text;
  }

  await sql.query(
    `INSERT INTO project_item_field_values(
       project_id,item_id,field_id,value_type,date_value,iteration_id,
       number_value,single_select_option_id,text_value,version,updated_at
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT(item_id,field_id) DO UPDATE
     SET project_id=EXCLUDED.project_id,
         value_type=EXCLUDED.value_type,
         date_value=EXCLUDED.date_value,
         iteration_id=EXCLUDED.iteration_id,
         number_value=EXCLUDED.number_value,
         single_select_option_id=EXCLUDED.single_select_option_id,
         text_value=EXCLUDED.text_value,
         version=project_item_field_values.version+1,
         updated_at=EXCLUDED.updated_at`,
    [
      projectId,
      itemId,
      fieldId,
      value.type,
      dateValue,
      iterationId,
      numberValue,
      singleSelectOptionId,
      textValue,
      previousVersion + 1,
      now,
    ],
  );

  if (value.type === "MULTI_SELECT") {
    for (const optionId of value.optionIds) {
      await sql.query(
        `INSERT INTO project_item_multi_select_values(
           project_id,item_id,field_id,option_id,added_at
         ) VALUES($1,$2,$3,$4,$5)`,
        [projectId, itemId, fieldId, optionId, now],
      );
    }
  }
}

export async function executeProjectFieldCommand(
  sql: Sql,
  projectId: string,
  command: ProjectManagementCommand,
  now: number,
): Promise<{ resourceId: string | null; data: Record<string, unknown> }> {
  if (command.action === "create-field") {
    validateFieldShape(command.dataType, command.options, command.iterations);
    const fieldId = randomUUID();
    await sql.query(
      `INSERT INTO project_fields(
         id,project_id,name,data_type,version,created_at,updated_at
       ) VALUES($1,$2,$3,$4,1,$5,$5)`,
      [fieldId, projectId, command.name, command.dataType, now],
    );
    if (command.dataType === "SINGLE_SELECT" || command.dataType === "MULTI_SELECT") {
      if (command.options.some((item) => item.id !== undefined)) {
        throw new ProjectError(400, "建立 field 時不能注入既有 option identity。");
      }
      await insertOptions(sql, fieldId, command.dataType, command.options);
    } else if (command.dataType === "ITERATION") {
      if (command.iterations.some((item) => item.id !== undefined)) {
        throw new ProjectError(400, "建立 field 時不能注入既有 iteration identity。");
      }
      await insertIterations(sql, fieldId, command.iterations);
    }
    return {
      resourceId: fieldId,
      data: { fieldId, name: command.name, dataType: command.dataType },
    };
  }

  if (command.action === "update-field") {
    const before = await currentField(sql, projectId, command.fieldId);
    requireFieldVersion(before, command.fieldVersion);
    const name = command.name ?? before.name;
    if (command.options !== undefined) {
      await replaceOptions(sql, before, command.options);
    }
    if (command.iterations !== undefined) {
      await replaceIterations(sql, before, command.iterations);
    }
    const nameChanged = name !== before.name;
    const configChanged =
      command.options !== undefined && command.options.length > 0 ||
      command.iterations !== undefined && command.iterations.length > 0;
    if (!nameChanged && !configChanged) {
      throw new ProjectError(409, "Project field 沒有變更。");
    }
    const updated = (
      await sql.query(
        `UPDATE project_fields
         SET name=$3,version=version+1,updated_at=$4
         WHERE project_id=$1 AND id=$2 AND version=$5
         RETURNING version`,
        [projectId, before.id, name, now, command.fieldVersion],
      )
    ).rows[0] as { version: number | string } | undefined;
    if (!updated) throw new ProjectError(409, "Project field 已更新。");
    return {
      resourceId: before.id,
      data: { fieldId: before.id, fieldVersion: Number(updated.version), name },
    };
  }

  if (command.action === "delete-field") {
    const before = await currentField(sql, projectId, command.fieldId);
    requireFieldVersion(before, command.fieldVersion);
    const inUse = (
      await sql.query(
        `SELECT 1 FROM project_item_field_values WHERE project_id=$1 AND field_id=$2
         UNION ALL
         SELECT 1 FROM project_item_multi_select_values WHERE project_id=$1 AND field_id=$2
         UNION ALL
         SELECT 1 FROM project_view_visible_fields WHERE project_id=$1 AND field_id=$2
         LIMIT 1`,
        [projectId, before.id],
      )
    ).rows[0];
    if (inUse) {
      throw new ProjectError(409, "Project field 仍被 item value 或 view 使用，不能刪除。");
    }
    await sql.query("DELETE FROM project_field_options WHERE field_id=$1", [before.id]);
    await sql.query("DELETE FROM project_field_iterations WHERE field_id=$1", [before.id]);
    await sql.query(
      "DELETE FROM project_fields WHERE project_id=$1 AND id=$2 AND version=$3",
      [projectId, before.id, command.fieldVersion],
    );
    return { resourceId: before.id, data: { fieldId: before.id, deleted: true } };
  }

  if (command.action === "set-field-value") {
    await requireItem(sql, projectId, command.itemId);
    const selected = await currentField(sql, projectId, command.fieldId);
    if (selected.data_type !== command.value.type) {
      throw new ProjectError(409, "Project field value type 與 field definition 不一致。");
    }
    await upsertValue(sql, projectId, command.itemId, command.fieldId, command.value, now);
    return {
      resourceId: command.itemId,
      data: {
        itemId: command.itemId,
        fieldId: command.fieldId,
        valueType: command.value.type,
      },
    };
  }

  if (command.action === "clear-field-value") {
    await requireItem(sql, projectId, command.itemId);
    await currentField(sql, projectId, command.fieldId);
    const multi = await sql.query(
      `DELETE FROM project_item_multi_select_values
       WHERE project_id=$1 AND item_id=$2 AND field_id=$3
       RETURNING option_id`,
      [projectId, command.itemId, command.fieldId],
    );
    const scalar = await sql.query(
      `DELETE FROM project_item_field_values
       WHERE project_id=$1 AND item_id=$2 AND field_id=$3
       RETURNING field_id`,
      [projectId, command.itemId, command.fieldId],
    );
    if (!multi.rows.length && !scalar.rows.length) {
      throw new ProjectError(409, "Project field value 已是空值。");
    }
    return {
      resourceId: command.itemId,
      data: { itemId: command.itemId, fieldId: command.fieldId, cleared: true },
    };
  }

  throw new ProjectError(400, "不是 Project field 操作。");
}
