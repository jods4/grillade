// Data-grid supports server-side paging through { orderBy, skip, top } parameters.
// The format is compatible (i.e. a subset) with odata-query https://www.npmjs.com/package/odata-query

export type ODataRequest<T> = {
  orderBy?: (keyof T | [keyof T, "asc" | "desc"])[];
  skip?: number;
  top?: number;
};

export type ODataResponse<T> = {
  "@odata.count": number;
  value: T[];
};

export type ODataFetch<T> = (odata?: ODataRequest<T>) => Promise<ODataResponse<T>>;
