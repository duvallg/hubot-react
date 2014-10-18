// Description:
//   Train hubot to react to certain terms.
//
// Dependencies:
//   "underscore": "~1.7.0"
//   "natural": "~0.1.28"
//
// Configuration:
//   HUBOT_REACT_CACHE_SIZE=N - Cache the last N messages for each user for potential remembrance (default 25).
//   HUBOT_REACT_STORE_SIZE=N - Remember at most N messages (default 200).
//
// Commands:
//   hubot react <term> <response> - tell hubot to react with <response> when it hears <term>
//   hubot ignore that - tell hubot to forget the last <term> <response> pair that was uttered.
//
// Author:
//   b3nj4m

var _ = require('underscore');
var natural = require('natural');

var stemmer = natural.PorterStemmer;

var CACHE_SIZE = process.env.HUBOT_REACT_CACHE_SIZE ? parseInt(process.env.HUBOT_REACT_CACHE_SIZE) : 25;
var STORE_SIZE = process.env.HUBOT_REACT_STORE_SIZE ? parseInt(process.env.HUBOT_REACT_STORE_SIZE) : 200;

var lastUsedResponse = null;

function firstStem(text) {
  return _.first(stemmer.tokenizeAndStem(text));
}

function uniqueStems(text) {
  return _.unique(stemmer.tokenizeAndStem(text));
}

var successTmpl = _.template('<%= term %> => <%= response %>');
var responseTmpl = _.template('<%= response %>');

function randomItem(list) {
  return list[_.random(list.length - 1)];
}

function responseToString(response) {
  return responseTmpl(response);
}

function successMessage(response) {
  return successTmpl(response);
}

function getResponses(retrieve, store, text) {
  var stems = uniqueStems(text);
  var messageStore = retrieve('reactMessageStore');

  return _.flatten(_.compact(_.map(stems, function(stem) {
    return messageStore[stem] === undefined ? null, _.values(messageStore[stem]);
  })));
}

function addResponse(retrieve, store, term, response) {
  var stem = firstStem(term);
  var messageStore = retrieve('reactMessageStore');

  messageStore[stem] = messageStore[stem] || {};
  messageStore[stem][response] = {
    term: term,
    stem: stem,
    response: response
  };

  store('reactMessageStore', messageStore);

  return messageStore[stem][response];
}

function deleteResponse(retrieve, store, term, response) {
  var messageStore = retrieve('reactMessageStore');

  if (messageStore[term] !== undefined && messageStore[term][response] !== undefined) {
    delete messageStore[term][response];

    store('reactMessageStore', messageStore);

    return true;
  }
  return false;
}

function serialize(data) {
  try {
    string = JSON.stringify(data);
  }
  catch (err) {
    //emit error?
  }

  return string;
}

function deserialize(string) {
  try {
    data = JSON.parse(string);
  }
  catch (err) {
    //emit error?
  }

  return data;
}

function robotStore(robot, key, data) {
  return robot.brain.set(key, serialize(data));
}

function robotRetrieve(robot, key) {
  return deserialize(robot.brain.get(key));
}

function start(robot) {
  var store = robotStore.bind(this, robot);
  var retrieve = robotRetrieve.bind(this, robot);

  var get = getResponses.bind(this, retrieve, store);
  var add addResponse.bind(this, retrieve, store);
  var del deleteResponse.bind(this, retrieve, store);

  robot.brain.setAutoSave(true);

  var messageStore = retrieve('reactMessageStore');
  if (!messageStore) {
    store('reactMessageStore', {});
  }

  var hubotMessageRegex = new RegExp('^[@]?' + robot.name + '[:,]?\\s', 'i');

  robot.respond(/react (\w*) (.*)/i, function(msg) {
    var term = msg.match[1];
    var response = msg.match[2];

    var responseObj = add(term, response);

    msg.send(successMessage(responseObj));
  });

  robot.respond(/ignore that/i, function(msg) {
    var ignored = false;

    if (lastUsedResponse) {
      ignored = del(lastUsedResponse.term, lastUsedResponse.response);
    }

    if (ignored) {
      msg.send(ignoredMessage(lastUsedResponse));
    }
    else {
      msg.send(lastResponseNotFoundMessage());
    }

    lastUsedResponse = null;
  });

  robot.hear(/.*/, function(msg) {
    var text = msg.message.text;

    //TODO existing way to test this somewhere??
    if (!hubotMessageRegex.test(text)) {
      var responses = get(text);

      if (responses.length > 0) {
        var response = randomItem(responses);
        msg.send(responseToString(response));
        lastUsedResponse = response;
      }
    }
  });
}

module.exports = function(robot) {
  var loaded = function() {
    start(robot);
  };

  if (_.isEmpty(robot.brain.data) || _.isEmpty(robot.brain.data._private)) {
    robot.brain.once('loaded', loaded);
  }
  else {
    loaded();
  }
};
