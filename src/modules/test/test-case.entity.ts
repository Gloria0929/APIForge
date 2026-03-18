import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from "typeorm";
import { Project } from "../project/project.entity";
import { API } from "../api/api.entity";
import { jsonTextTransformer } from "../../common/typeorm-json.transformer";

@Entity()
export class TestCase {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  projectId: string;

  @Column({ nullable: true })
  apiId?: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column("text", {
    transformer: jsonTextTransformer<TestRequest>({
      defaultValue: {
        method: "GET",
        url: "",
        headers: {},
        query: {},
      } as any,
    }),
  })
  request: TestRequest;

  @Column("text", {
    transformer: jsonTextTransformer<Assertion[]>({ defaultValue: [] }),
  })
  assertions: Assertion[];

  @Column("text", {
    nullable: true,
    transformer: jsonTextTransformer<TestHook[] | null>({ defaultValue: null }),
  })
  setup?: TestHook[] | null;

  @Column("text", {
    nullable: true,
    transformer: jsonTextTransformer<TestHook[] | null>({ defaultValue: null }),
  })
  teardown?: TestHook[] | null;

  @Column("text", {
    nullable: true,
    transformer: jsonTextTransformer<string[] | null>({ defaultValue: null }),
  })
  tags: string[] | null;

  @Column("text", {
    nullable: true,
    transformer: jsonTextTransformer<any | null>({ defaultValue: null }),
  })
  lastRun?: any | null;

  @Column()
  priority: "P0" | "P1" | "P2" | "P3";

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Project, (project) => project.testCases, {
    onDelete: "CASCADE",
  })
  project: Project;

  @ManyToOne(() => API, (api) => api.testCases, {
    onDelete: "SET NULL",
    nullable: true,
  })
  api: API;
}

export interface TestRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  query: Record<string, any>;
  body?: any;
  // Optional request body encoding. When not provided, JSON is assumed.
  // - none: no body
  // - json: uses `body`
  // - urlencoded / form-data: uses `bodyForm` (array of {key,value})
  bodyType?:
    | "none"
    | "json"
    | "urlencoded"
    | "form-data"
    | "formdata"
    | "multipart";
  bodyForm?:
    | Array<{
        key: string;
        value: any;
        type?: "text" | "file";
        filename?: string;
      }>
    | Record<string, any>;
  auth?: AuthConfig;
}

export interface AuthConfig {
  type: "basic" | "bearer" | "api_key" | "oauth2";
  credentials: any;
}

export interface Assertion {
  type:
    | "STATUS"
    | "HEADER"
    | "BODY"
    | "JSON_PATH"
    | "RESPONSE_TIME"
    | "CUSTOM_SCRIPT";
  target?: string;
  condition: "eq" | "neq" | "gt" | "lt" | "contains" | "exists" | "matches";
  expected: any;
  message?: string;
}

export interface TestHook {
  type: "DELAY" | "SCRIPT" | "REQUEST";
  config: any;
}
