import initSqlJs from 'sql.js';
export declare const db: {
    pragma: (str: string) => void;
    exec: (sql: string) => void;
    prepare: (query: string) => {
        all: (...params: any[]) => any[];
        get: (...params: any[]) => initSqlJs.ParamsObject;
        run: (...params: any[]) => {
            changes: number;
            lastInsertRowid: number;
        };
    };
};
