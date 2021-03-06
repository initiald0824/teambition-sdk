import { Observable, Scheduler, Subject } from 'rxjs'
import { expect } from 'chai'
import { describe, it, beforeEach, afterEach } from 'tman'

import { HttpErrorMessage, Http } from '../index'
import * as http from '../../src/Net/Http'

const fetchMock = require('fetch-mock')

export default describe('net/http', () => {

  let fetchInstance: Http<any>
  let url: string
  const apiHost = 'https://www.teambition.com/api'
  const path = 'test'
  const allowedMethods = ['get', 'post', 'put', 'delete']

  beforeEach(() => {
    url = `${apiHost}/${path}`
    fetchInstance = new Http(url)
  })

  afterEach(() => {
    fetchMock.restore()
  })

  it('should call isomophic fetch with the correct arguments', function* () {
    const data = { test: 'test' }
    fetchMock.mock(url, data)
    yield fetchInstance.get().send()
      .subscribeOn(Scheduler.asap)
      .do(() => {
        expect(fetchMock.calls().matched.length).to.equal(1)
        expect(fetchMock.lastUrl()).to.equal(url)
        expect(fetchMock.lastOptions()).to.deep.equal({
          method: 'get',
          headers: {},
          credentials: 'include'
        })
      })
  })

  it('should set headers', function* () {
    const header = { 'X-Request-Id': '2333' }
    fetchInstance.setHeaders(header)
    fetchMock.mock(url, {})
    yield fetchInstance.get()
      .send()
      .subscribeOn(Scheduler.asap)
      .do(() => {
        expect(fetchMock.lastOptions()).to.deep.equal({
          method: 'get',
          headers: {
            'X-Request-Id': '2333'
          },
          credentials: 'include'
        })
      })
  })

  it('should set headers with copy of the input headers', function* () {
    const headers = {}

    fetchInstance.setHeaders(headers)

    // 如果使用的是传入 headers 对象的引用，下面修改会导致最终 headers 被修改
    headers['X-Request-Id'] = '2333'

    fetchMock.mock(url, {})
    yield fetchInstance.get()
      .send()
      .subscribeOn(Scheduler.asap)
      .do(() => {
        expect(fetchMock.lastOptions().headers).to.deep.equal({})
      })
  })

  it('should set token', function* () {
    const token = 'test_token'
    fetchInstance.setToken(token)
    fetchMock.mock(url, {})
    yield fetchInstance.get()
      .send()
      .subscribeOn(Scheduler.asap)
      .do(() => {
        expect(fetchMock.lastOptions()).to.deep.equal({
          method: 'get',
          headers: {
            'Authorization': `OAuth2 ${token}`
          }
        })
      })
  })

  allowedMethods.forEach(httpMethod => {
    it(`should define ${httpMethod}`, function* () {
      const responseData = { test: 'test' }
      const body = { body: 'body' }
      fetchMock.mock(url, JSON.stringify(responseData), {
        method: httpMethod
      })

      yield fetchInstance[httpMethod](httpMethod === 'get' || httpMethod === 'delete' ? null : body)
        .send()
        .subscribeOn(Scheduler.asap)
        .do((res: any) => {
          expect(fetchMock.lastOptions().method).to.equal(httpMethod)
          expect(res).to.deep.equal(responseData)
          if (httpMethod === 'put' || httpMethod === 'post') {
            expect(fetchMock.lastOptions().body).to.deep.equal(body)
          }
        })
    })
  })

  it('delete() should support carrying request body', function* () {
      const responseData = { test: 'test' }
      const body = { body: 'body' }
      fetchMock.mock(url, JSON.stringify(responseData), {
        method: 'delete'
      })

      yield fetchInstance.delete(body)
        .send()
        .subscribeOn(Scheduler.asap)
        .do((res: any) => {
          expect(fetchMock.lastOptions().method).to.equal('delete')
          expect(fetchMock.lastOptions().body).to.deep.equal(body)
          expect(res).to.deep.equal(responseData)
        })
    })

  allowedMethods.forEach(httpMethod => {
    it(`${httpMethod} Result should be able to include response headers`, function* () {
      const responseData = { test: 'test' }
      const body = { body: 'body' }
      const sampleValue = '2333'
      fetchMock.mock(url, {
        body: JSON.stringify(responseData),
        headers: {
          'X-Request-Id': sampleValue
        }
      }, {
        method: httpMethod
      })

      const fetchInstance2 = http.getHttpWithResponseHeaders(url)
      fetchInstance2.setHeaders({ 'X-Request-Id': sampleValue })

      yield fetchInstance2[httpMethod](path, httpMethod === 'get' || httpMethod === 'delete' ? null : body)
        .send()
        .subscribeOn(Scheduler.asap)
        .do((resp: any) => {
          expect(resp.body).to.deep.equal(responseData)
          expect(resp.headers.get('x-request-id')).to.equal(sampleValue)
        })
    })
  })

  allowedMethods.forEach(httpMethod => {
    [400, 401, 403, 404, 500].forEach(status => {
      it(`should handle ${status} status for ${httpMethod}`, function* () {
        const responseData = { body: { test: 'test' }, method: httpMethod, status }
        const body = { body: 'body' }
        fetchMock.mock(url, responseData )
        yield fetchInstance[httpMethod](path, httpMethod === 'get' ? null : body)
          .send()
          .catch((res: HttpErrorMessage) => {
            if (fetchMock.lastOptions()) {
              expect(fetchMock.lastOptions().method).to.equal(httpMethod)
            }
            expect(res.error.status).to.equal(status)
            expect(res.method).to.equal(httpMethod)
            expect(res.url).to.equal(url)
            return Observable.empty()
          })
          .subscribeOn(Scheduler.asap)
      })
    })
  })

  it('should emit usable error: Response at both original$ and errorAdaptor$', function* () {
    const status = 429
    const body = { text: 'busy' }
    fetchMock.mock(url, { body, method: 'get', status })

    const errorAdaptor$ = new Subject<HttpErrorMessage>()
    const fetchInstance2 = new Http(url, errorAdaptor$)

    const caught$ = fetchInstance2.get()
      .send()
      .catch((res: HttpErrorMessage) => Observable.of(res)) as Observable<HttpErrorMessage>

    yield Observable.zip(caught$, errorAdaptor$)
      .flatMap(([caught, adaptor]) => {
        return Observable.zip(
          Observable.fromPromise(caught.error.json()),
          Observable.fromPromise(adaptor.error.json())
        )
      })
      .do(([caught, errorMsg]) => {
        expect(caught).to.deep.equal(body)
        expect(errorMsg).to.deep.equal(body)
      })
      .catch(() => {
        expect('Should not reach here!').to.equal('')
        return Observable.empty()
      })
      .subscribeOn(Scheduler.asap)
  })

  it('createMethod() should give response text when it cannot be parsed successfully', function* () {
    const letJSONparseThrow = '[1, 2, 3,]'
    fetchMock.getOnce(url, letJSONparseThrow)

    yield http.createMethod('get')({ url } as any)
      .subscribeOn(Scheduler.asap)
      .do((x: any) => {
        expect(x).to.equal(letJSONparseThrow)
      })
  })

  it('correctly clone-ed Http instance should use cached response', function* () {
    const expectedResp = { value: 'A' }

    fetchInstance.get()
    // 一个从源 Http 对象 clone 的对象
    const fetchInstanceClone1 = fetchInstance.clone()
    // 第二个从源 Http 对象 clone 的对象
    const fetchInstanceClone2 = fetchInstance.clone()
    // 一个从 clone 出来的 Http 对象 clone 的对象
    const fetchInstanceClone1Clone = fetchInstanceClone1.clone()

    fetchMock.get(url, { body: JSON.stringify(expectedResp) })

    yield Observable.forkJoin(
      fetchInstance.send(),
      fetchInstanceClone1.send(),
      fetchInstanceClone2.send(),
      fetchInstanceClone1Clone.send()
    )
    .subscribeOn(Scheduler.asap)
    .do(([res, resClone1, resClone2, resClone1Clone]) => {
      expect(res).to.deep.equal(expectedResp)
      expect(resClone1).to.deep.equal(expectedResp)
      expect(resClone2).to.deep.equal(expectedResp)
      expect(resClone1Clone).to.deep.equal(expectedResp)
      expect(fetchMock.calls(url)).lengthOf(1)
    })
  })
})
