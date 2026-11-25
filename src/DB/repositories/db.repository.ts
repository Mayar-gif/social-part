import type {
  FilterQuery,
  HydratedDocument,
  Model,
  ProjectionType,
  QueryOptions,
  UpdateQuery,
  UpdateWriteOpResult,
} from 'mongoose';

type Doc<T> = HydratedDocument<T>;
type Options<T> = QueryOptions<T> & { paranoid?: boolean };

export abstract class DBRepository<TDocument> {
  constructor(protected readonly model: Model<TDocument>) {}

  async create(data: Partial<TDocument>): Promise<Doc<TDocument>> {
    return (await this.model.create(data as any)) as unknown as Doc<TDocument>;
  }

  async findOne({
    filter,
    projection,
    options,
  }: {
    filter: FilterQuery<TDocument>;
    projection?: ProjectionType<TDocument>;
    options?: Options<TDocument>;
  }): Promise<Doc<TDocument> | null> {
    return (await this.model.findOne(filter, projection, options)) as Doc<TDocument> | null;
  }

  async findById({
    id,
    projection,
    options,
  }: {
    id: string;
    projection?: ProjectionType<TDocument>;
    options?: Options<TDocument>;
  }): Promise<Doc<TDocument> | null> {
    return (await this.model.findById(id, projection, options)) as Doc<TDocument> | null;
  }

  async find({
    filter,
    projection,
    options,
  }: {
    filter: FilterQuery<TDocument>;
    projection?: ProjectionType<TDocument>;
    options?: Options<TDocument>;
  }): Promise<Doc<TDocument>[]> {
    return (await this.model.find(filter, projection, options)) as Doc<TDocument>[];
  }

  async updateOne({
    filter,
    update,
    options,
  }: {
    filter: FilterQuery<TDocument>;
    update: UpdateQuery<TDocument>;
    options?: Options<TDocument>;
  }): Promise<UpdateWriteOpResult> {
    return this.model.updateOne(filter, update, options);
  }

  async updateMany({
    filter,
    update,
  }: {
    filter: FilterQuery<TDocument>;
    update: UpdateQuery<TDocument>;
  }): Promise<UpdateWriteOpResult> {
    return this.model.updateMany(filter, update);
  }

  async countDocuments(filter: FilterQuery<TDocument> = {}): Promise<number> {
    return this.model.countDocuments(filter);
  }
}
