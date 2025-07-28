import { parseArgs } from "node:util";
import { getMonth, getYear, lastDayOfMonth } from "date-fns";

const { values } = parseArgs({
  options: {
    month: {
      type: "string",
    },
    year: {
      type: "string",
    },
  },
});

export function getDateRange() {
  const today = new Date();
  const month = values.month ? parseInt(values.month) - 1 : getMonth(today);
  if (Number.isNaN(month) || month < 0 || month > 11) {
    throw new Error(`Invalid month: ${values.month}`);
  }
  const year = values.year ? parseInt(values.year) : getYear(today);
  if (Number.isNaN(year)) {
    throw new Error(`Invalid year: ${values.year}`);
  }

  const startDate = new Date(year, month, 1);
  const endDate = lastDayOfMonth(startDate);

  return {
    startDate,
    endDate,
  };
}
