import express from 'express'
import isEmpty from 'lodash/isEmpty'
import rongcloudSDK from 'rongcloud-sdk'

import {
  avatarUploadInfo,
  formatedUserInfo,
} from '../../lib/util'
import {
  rcCfg,
  qiniuCfg,
} from '../../config'
import db from '../../lib/db'
import model from '../../model'
import { tokenValidator } from '../../lib/routerMiddlewares'

rongcloudSDK.init(rcCfg.appKey, rcCfg.appSecret)
const router = express.Router()

// login
router.post('/login', (req, res) => {
  const {
    account,
    password
  } = req.body

  const queries = [
    model.user.findOne({ account, password }),
    model.follow.find({ follower: account }), //关注数
    model.follow.find({ following: account }), //粉丝数
  ]

  Promise.all(queries)
  .then(queryItems => {
    const [ user, followings, followers ] = queryItems
    if (isEmpty(user)) {
      res.send({ error: `${account} 不存在` })
    } else {
      const { name } = user
      rongcloudSDK.user.getToken(
        account,
        name,
        'http://www.rongcloud.cn/docs/assets/img/logo_s@2x.png',
        (error, resultText) => {
          if (isEmpty(error)) {
            const result = JSON.parse(resultText)
            const {
              code,
              token,
            } = result
            if (code === 200) {
                model.token.findOneAndUpdate({ account }, { token }, { upsert: true })
                .then(doc => {
                  res.send({
                    result: {
                      user: formatedUserInfo({ user, followings, followers }),
                      token,
                    }
                  })
                })
                .catch(error => {
                  console.warn(error)
                  res.send({ error })
                })
            } else {
                console.warn(`status code ${code}`)
                res.send({ error: `status code ${code}` })
            }
          } else {
            console.warn(error)
            res.send({ error })
          }
        }
      )
    }
  })
  .catch(error => {
    console.warn(error)
    res.send({ error })
  })
})

router.post('/oldlogin', (req, res) => {
  const {
    account,
    password,
  } = req.body

  if (isEmpty(account)) {
    return res.send({ error: '账号不可为空' })
  }

  model.user.findOne({ account, password })
  .then(rawUser => {
    if (isEmpty(rawUser)) {
      res.send({ error: '账号或密码错误' })
    } else {
      const { name, avatar } = rawUser

      rongcloudSDK.user.getToken(
        account,
        name,
        'http://www.rongcloud.cn/docs/assets/img/logo_s@2x.png',
        (error, resultText) => {
          if (isEmpty(error)) {
            const result = JSON.parse(resultText)
            const {
              code,
              token,
            } = result
            if (code === 200) {
                model.token.findOneAndUpdate({ account }, { token }, { upsert: true })
                .then( _ => res.send({
                  result: {
                    user: formatedUserInfo({ user: rawUser }),
                    token,
                  }
                }))
                .catch(error => {
                  console.warn(error)
                  res.send({ error })
                })
            } else {
                console.warn(`status code ${code}`)
                res.send({ error: `status code ${code}` })
            }
          } else {
            res.send({ error })
          }
        }
      )
    }
  })
  .catch(error => {
    console.warn(error)
    res.send({ error })
  })
})

router.post('/register', (req, res) => {
  const {
    account,
    name = 'null',
    password,
    avatar,
  } = req.body
  if (isEmpty(account)) {
    return res.send({ error: '账号不可为空' })
  }
  const user = {
    account,
    name,
    password,
    avatar,
  }
  model.user.findOne({ account })
  .then(result => {
    if (isEmpty(result)) {
      const userEntity = new model.user(user)
      userEntity.save()
      .then(
        _ => {
          rongcloudSDK.user.getToken(
            account,
            name,
            'http://www.rongcloud.cn/docs/assets/img/logo_s@2x.png',
            (error, resultText) => {
              if (isEmpty(error)) {
                const result = JSON.parse(resultText)
                const {
                  code,
                  token,
                } = result
                if (code === 200) {
                    model.token.findOneAndUpdate({ account }, { token }, { upsert: true })
                    .then( _ => res.send({
                      result: {
                        user: {
                          account,
                          name,
                          avatar,
                        },
                        token,
                      }
                    }))
                    .catch(error => {
                      console.warn(error)
                      res.send({ error })
                    })
                } else {
                    console.warn(`status code ${code}`)
                    res.send({ error: `status code ${code}` })
                }
              } else {
                res.send({ error })
              }
            }
          )
        }
      )
      .catch(error => {
        console.warn(error)
        res.send({ error })
      })
    } else {
      res.send({ error: '该账号已被注册' })
    }
  })
  .catch(error => {
    console.warn(error)
    res.send({ error })
  })
})

router.get('/getAvatarUploadInfo', tokenValidator, (req, res) => {
  const { account } = req.params
  const result = avatarUploadInfo(account)
  res.send({ result })
})

router.post('/changeAvatar', tokenValidator, (req, res) => {
  const { account } = req.params
  const { key } = req.body
  if (isEmpty(key)) {
    return res.send({ error: 'key not valid' })
  }

  let avatar = `${qiniuCfg.host}/${key}`
  if (!qiniuCfg.host.startsWith('http://') && !qiniuCfg.host.startsWith('https://')) {
    avatar = `http://${avatar}`
  }
  model.user.findOneAndUpdate({ account }, { avatar }, { new: true })
  .then(user => res.send({ result: formatedUserInfo({ user }) }))
  .catch(error => {
    console.warn(error)
    res.send({ error })
  })
})

router.post('/changeName', tokenValidator, (req, res) => {
  const { account } = req.params
  const { name } = req.body
  const newName = name && name.trim()
  if (isEmpty(newName)) {
    return res.send({ error: '姓名不可为空' })
  }
  model.user.findOneAndUpdate({ account }, { name: newName }, { new: true })
  .then(user => res.send({ result: formatedUserInfo({ user }) }))
  .catch(error => {
    console.warn(error)
    res.send({ error })
  })
})

router.post('/changeMotto', tokenValidator, (req, res) => {
  const { account } = req.params
  const { motto } = req.body

  model.user.findOneAndUpdate({ account }, { motto }, { new: true })
  .then(user => res.send({ result: formatedUserInfo({ user }) }))
  .catch(error => {
    console.warn(error)
    res.send({ error })
  })
})

router.get('/getUserByAccount', tokenValidator, (req, res) => {
  const { account } = req.query
  const { account: callerAccount } = req.params

  const queries = [
    model.user.findOne({ account }),
    model.follow.findOne({ follower: callerAccount, following: account })
  ]

  Promise.all(queries)
  .then(queryItems => {
    const [ user, follow ] = queryItems
    res.send({
      result: {
        user,
        follow,
      }
    })
  })
  .catch(error => {
    console.warn(error)
    res.send({ error })
  })
})

router.post('/getUserByAccount', tokenValidator, (req, res) => {
  const { account } = req.body
  const { account: callerAccount } = req.params

  const queries = [
    model.user.findOne({ account }),
    model.follow.findOne({ follower: callerAccount, following: account })
  ]

  Promise.all(queries)
  .then(queryItems => {
    const [ user, follow ] = queryItems
    res.send({
      result: {
        user,
        follow,
      }
    })
  })
  .catch(error => {
    console.warn(error)
    res.send({ error })
  })
})

export default router