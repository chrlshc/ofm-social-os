import { ApifyClient } from 'apify-client';

export class ApifyDiscoveryProvider {
  /**
   * @param {{ token: string }} opts
   */
  constructor (opts) {
    if (!opts?.token) throw new Error('APIFY_TOKEN manquant');
    this.client = new ApifyClient({ token: opts.token });
  }

  /**
   * Découvre des profils via un hashtag (actor officiel Apify)
   * @param {string} hashtag
   * @param {number} limit
   * @returns {Promise<Array<{username:string, followers?:number, url?:string, caption?:string}>>}
   */
  async discoverByHashtag(hashtag, limit = 100) {
    const run = await this.client.actor('apify/instagram-scraper').call({
      search: hashtag,
      resultsLimit: limit
    });
    const { items } = await this.client.dataset(run.defaultDatasetId).listItems();
    return (items ?? []).map(it => ({
      username: it.ownerUsername || it.username,
      followers: it.ownerFollowersCount || it.followers,
      url: it.url,
      caption: it.caption
    })).filter(x => x.username);
  }
}