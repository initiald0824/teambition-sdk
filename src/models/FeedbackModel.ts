'use strict'
import { Observable } from 'rxjs/Observable'
import Model from './BaseModel'
import Collection from './BaseCollection'
import FeedbackSchema, { FeedbackData } from '../schemas/Feedback'
import { dataToSchema, datasToSchemas } from '../utils'

export class FeedbackModel extends Model {

  private _schemaName = 'Feedback'
  private _collections = new Map<string, Collection<FeedbackData>>()

  destructor() {
    this._collections.clear()
  }

  addOne(data: FeedbackData): Observable<FeedbackData> {
    const result = dataToSchema(data, FeedbackSchema)
    return this._save(result)
  }

  getOne(feedbackId: string): Observable<FeedbackData> {
    return this._get<FeedbackData>(feedbackId)
  }

  addProjectFeedbacks(projectId: string, feedbacks: FeedbackData[], page = 1, count = 100): Observable<FeedbackData[]> {
    const result = datasToSchemas(feedbacks, FeedbackSchema)
    const dbIndex = `project:feedbacks/${projectId}`

    let cache: Collection<FeedbackData> = this._collections.get(dbIndex)
    if (!cache) {
      cache = new Collection(this._schemaName, (data: FeedbackData) => {
        return data.boundToObjectType === 'project' && data._boundToObjectId === projectId
      }, dbIndex, count)
      this._collections.set(dbIndex, cache)
    }
    return cache.addPage(page, result)
  }

  getProjectFeedbacks(projectId: string, page: number) {
    const collection = this._collections.get(`project:feedbacks/${projectId}`)
    if (collection) {
      return collection.get(page)
    }
    return null
  }
}

export default new FeedbackModel()