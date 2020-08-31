import { joinPath } from '../../lib/strings.js'
import { createResourceSlug, normalizeUrl } from '../../lib/urls'
import * as drives from '../hyper/drives'
import * as indexer from '../indexer/index'
import { METADATA_KEYS } from '../indexer/const'
import * as filesystem from './index'
import { URL } from 'url'

// exported
// =

/**
 * @returns {Promise<Object>}
 */
export async function list () {
  var results = await indexer.listRecords({
    file: {mimetype: 'application/goto', prefix: '/subscriptions'},
    site: ['hyper://private', filesystem.getProfileUrl()],
    limit: 1e9
  })
  return results.map(massageSubscription)
}

/**
 * @param {string} href
 * @returns {Promise<Object>}
 */
export async function get (href) {
  href = normalizeUrl(href)
  var results = await indexer.listRecords({
    file: {mimetype: 'application/goto', prefix: '/subscriptions'},
    site: ['hyper://private', filesystem.getProfileUrl()],
    links: href,
    limit: 1
  })
  if (results[0]) {
    return massageSubscription(results[0])
  }
}

/**
 * @param {string} href
 * @returns {Promise<Object>}
 */
export async function listNetworkFor (href) {
  href = normalizeUrl(href)
  var results = await indexer.listRecords({
    file: {mimetype: 'application/goto', prefix: '/subscriptions'},
    links: href,
    limit: 1e9
  })
  return results.map(massageSubscription)
}

/**
 * @param {Object} subscription
 * @param {string} subscription.href
 * @param {string} subscription.title
 * @param {String|Object} subscription.site
 * @returns {Promise<string>}
 */
export async function add ({href, title, site}) {
  href = normalizeUrl(href)
  site = site || 'hyper://private'
  if (typeof site === 'object' && site.url) {
    site = site.url
  }
  var drive = await drives.getOrLoadDrive(site)

  let existing = await get(href)
  if (existing) {
    await remove(href)
    return add({href, title, site})
  }

  // new bookmark
  var slug = createResourceSlug(href, title)
  var filename = await filesystem.getAvailableName('/subscriptions', slug, 'goto', drive) // avoid collisions
  var path = joinPath('/subscriptions', filename)
  await filesystem.ensureDir('/subscriptions', drive)
  await drive.pda.writeFile(path, '', {metadata: {
    [METADATA_KEYS.href]: href,
    [METADATA_KEYS.title]: title
  }})
  await indexer.triggerSiteIndex(site)
  return path
}

/**
 * @param {string} href
 * @returns {Promise<void>}
 */
export async function remove (href) {
  let existing = await get(href)
  if (!existing) return
  let urlp = new URL(existing.subscriptionUrl)
  let drive = await drives.getOrLoadDrive(urlp.hostname)
  await drive.pda.unlink(urlp.pathname)
  await indexer.triggerSiteIndex(urlp.hostname)
}

/**
 * @returns {Promise<void>}
 */
export async function migrateSubscriptionsFromContacts () {
  var addressBook = await filesystem.getAddressBook()
  var profileUrl = `hyper://${addressBook.profiles[0].key}`
  for (let contact of addressBook.contacts) {
    let url = `hyper://${contact.key}`
    if (!(await get(url))) {
      let info = await drives.getDriveInfo(url)
      await add({
        href: url,
        title: info.title,
        site: profileUrl
      })
    }
  }
}

// internal
// =

function massageSubscription (result) {
  return {
    subscriptionUrl: result.url,
    href: normalizeUrl(result.metadata[METADATA_KEYS.href]),
    title: result.metadata[METADATA_KEYS.title] || result.metadata[METADATA_KEYS.href],
    site: result.site
  }
}
