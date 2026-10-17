package cn.campus.web;

import cn.campus.admin.OwnerAccountService;
import cn.campus.ai.knowledge.ModelSettingsService;
import cn.campus.content.SeasonTopicService;
import cn.campus.point.PhotographyPlanService;
import cn.campus.settings.InteractionFeatures;
import org.springframework.stereotype.Service;

/** Small service registry; business logic stays in its own package. */
@Service
public record Release70Service(
    OwnerAccountService owner,
    ModelSettingsService model,
    SeasonTopicService topics,
    PhotographyPlanService plans,
    InteractionFeatures features) {
  public boolean handle(ApiContext c) throws Exception {
    return features.handle(c)
        || owner.handle(c)
        || model.handle(c)
        || topics.handle(c)
        || plans.handle(c);
  }
}
